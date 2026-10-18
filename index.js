import { Telegraf } from 'telegraf';
import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = pkg;
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';

// Pega o token do Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("ERRO: Variável BOT_TOKEN não configurada no Render!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
let latestQR = null; 

app.get('/', (req, res) => {
    res.send('<h1>Bot rodando! Acesse /qr para conectar.</h1>');
});

app.get('/qr', async (req, res) => {
    if (latestQR) {
        try {
            const qrImage = await QRCode.toDataURL(latestQR);
            res.send(`
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="refresh" content="15">
                </head>
                <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <h2 style="margin-bottom: 10px;">Conecte seu WhatsApp</h2>
                    <p style="color: #f39c12; font-size: 14px; margin-bottom: 20px; font-weight: bold;">⚠️ O código expira rápido. Escaneie agora!</p>
                    <div style="background: white; padding: 15px; border-radius: 10px;">
                        <img src="${qrImage}" style="width: 250px; height: 250px; display: block;" />
                    </div>
                    <p style="margin-top: 20px; color: #8b949e;">A página atualiza sozinha se o código expirar.</p>
                </body>
                </html>
            `);
        } catch (err) {
            res.send('Erro ao gerar imagem do QR Code.');
        }
    } else {
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="3">
            </head>
            <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <h2 style="color: #f39c12;">⏳ Aguardando conexão com WhatsApp...</h2>
                <p style="color: #8b949e;">O bot está tentando gerar o código. A página atualiza a cada 3s.</p>
                <p style="color: #8b949e; font-size: 12px;">(Se demorar muito, veja os Logs no Render)</p>
            </body>
            </html>
        `);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Web rodando na porta ' + (process.env.PORT || 3000));
});

let sock;

async function connectToWhatsApp() {
    // Limpa a pasta de autenticação toda vez que inicia para garantir um QR Code novo e evitar loop
    if (fs.existsSync('auth_info_baileys')) {
        console.log('Limpando sessão antiga para gerar novo QR Code...');
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // Busca a versão mais atual do WhatsApp Web para evitar bloqueios
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr; 
            console.log('✅ QR Code gerado! Acesse /qr no navegador.');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            console.log('Conexão fechada. Motivo/Erro:', lastDisconnect.error);
            
            // Se for loggedOut (deslogado), não reconecta, senão entra em loop
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Tentando reconectar:', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado com sucesso!');
            latestQR = null; 
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// Comandos do Telegram
bot.start((ctx) => {
    ctx.reply('Bem-vindo!\nUse: /enviar 5511999999999 Sua mensagem');
});

bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso: /enviar 5511999999999 Sua mensagem');
    const number = args[0].replace(/\D/g, '');
    const message = args.slice(1).join(' ');

    if (!sock) return ctx.reply('❌ WhatsApp não conectado. Acesse /qr');

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Enviado para ${number}!`);
    } catch (error) {
        ctx.reply('❌ Erro ao enviar.');
    }
});

bot.launch().then(() => console.log('🤖 Bot do Telegram iniciado!'))
    .catch((err) => console.error('Erro no Telegram:', err));
