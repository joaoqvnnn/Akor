const { Telegraf } = require('telegraf');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

// ⚠️ COLOQUE SEU TOKEN DO TELEGRAM AQUI
const BOT_TOKEN = process.env.BOT_TOKEN || 'SEU_TOKEN_AQUI';
const bot = new Telegraf(BOT_TOKEN);

const app = express();
let latestQR = null; // Guarda o QR Code atual na memória

// Página inicial
app.get('/', (req, res) => {
    res.send('<h1>Bot e WhatsApp rodando! Acesse /qr para conectar.</h1>');
});

// Página do QR Code (Pequeno e Fácil de Escanear)
app.get('/qr', async (req, res) => {
    if (latestQR) {
        // Gera a imagem em Base64
        const qrImage = await QRCode.toDataURL(latestQR);
        res.send(`
            <html>
            <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <h2 style="margin-bottom: 20px;">Conecte seu WhatsApp</h2>
                <div style="background: white; padding: 15px; border-radius: 10px;">
                    <img src="${qrImage}" style="width: 250px; height: 250px; display: block;" />
                </div>
                <p style="margin-top: 20px; color: #8b949e;">Vá em: WhatsApp > Dispositivos Conectados > Conectar Dispositivo</p>
                <p style="color: #8b949e; font-size: 12px;">(Atualize a página se o código expirar)</p>
            </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
            <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="background-color: #0d1117; color: #fff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <h2 style="color: #238636;">✅ WhatsApp Conectado!</h2>
                <p style="color: #8b949e;">O robô está online e pronto para enviar mensagens.</p>
                <p style="color: #8b949e; font-size: 12px;">Se você acabou de reiniciar o Render, aguarde 1 minuto e atualize esta página.</p>
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
    // O Baileys salva a sessão na pasta auth_info_baileys
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr; // Salva o QR para a página web
            console.log('Novo QR Code gerado. Acesse /qr no seu navegador.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando...');
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

// ==========================================
// COMANDOS DO TELEGRAM
// ==========================================
bot.start((ctx) => {
    ctx.reply('Bem-vindo!\n\nPara enviar mensagens use:\n/enviar 5511999999999 Sua mensagem aqui');
});

bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso correto: /enviar 5511999999999 Sua mensagem aqui');

    const number = args[0].replace(/\D/g, '');
    const message = args.slice(1).join(' ');

    if (!sock) return ctx.reply('❌ WhatsApp ainda não está conectado. Acesse a página /qr no seu navegador.');

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Mensagem enviada para ${number}!`);
    } catch (error) {
        console.error(error);
        ctx.reply('❌ Erro ao enviar. O número tem WhatsApp?');
    }
});

bot.launch().then(() => console.log('🤖 Bot do Telegram iniciado!'));
