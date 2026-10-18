const { Telegraf } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

// ⚠️ COLOQUE SEU TOKEN DO TELEGRAM AQUI
const BOT_TOKEN = process.env.BOT_TOKEN || 'SEU_TOKEN_AQUI';
const bot = new Telegraf(BOT_TOKEN);

const app = express();
let latestQR = null;

app.get('/', (req, res) => {
    res.send('<h1>Bot e WhatsApp rodando! Acesse /qr para conectar.</h1>');
});

app.get('/qr', async (req, res) => {
    if (latestQR) {
        const qrImage = await QRCode.toDataURL(latestQR);
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <!-- O SEGREDO ESTÁ AQUI: Atualiza a página a cada 15 segundos -->
                <meta http-equiv="refresh" content="15">
            </head>
            <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <h2 style="margin-bottom: 10px;">Conecte seu WhatsApp</h2>
                <p style="color: #f39c12; font-size: 14px; margin-bottom: 20px; font-weight: bold;">⚠️ O código expira em 20 segundos. Escaneie rápido!</p>
                <div style="background: white; padding: 15px; border-radius: 10px;">
                    <img src="${qrImage}" style="width: 250px; height: 250px; display: block;" />
                </div>
                <p style="margin-top: 20px; color: #8b949e;">A página atualiza sozinha a cada 15s.</p>
            </body>
            </html>
        `);
    } else {
        // Se o QR for nulo, pode ser que já conectou ou está gerando
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="5">
            </head>
            <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <h2 style="color: #238636;">✅ WhatsApp Conectado ou Gerando Código!</h2>
                <p style="color: #8b949e;">Se você já escaneou, está tudo certo. Pode fechar esta página.</p>
                <p style="color: #8b949e;">Se ainda não escaneou, aguarde 5 segundos (a página vai atualizar).</p>
            </body>
            </html>
        `);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Web rodando...');
});

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr;
            console.log('Novo QR Code gerado. Acesse /qr no navegador.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado com sucesso!');
            latestQR = null; // Limpa o QR pois já conectou
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

bot.start((ctx) => {
    ctx.reply('Bem-vindo!\nUse: /enviar 5511999999999 Sua mensagem');
});

bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso correto: /enviar 5511999999999 Sua mensagem');
    const number = args[0].replace(/\D/g, '');
    const message = args.slice(1).join(' ');

    if (!sock) return ctx.reply('❌ WhatsApp não conectado. Acesse /qr');

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Enviado para ${number}!`);
    } catch (error) {
        ctx.reply('❌ Erro ao enviar. Verifique o número.');
    }
});

bot.launch().then(() => console.log('🤖 Bot do Telegram iniciado!'));
