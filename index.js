import { Telegraf } from 'telegraf';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';

// ⚠️ O TOKEN VEM DAS VARIÁVEIS DE AMBIENTE DO RENDER
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("ERRO: Variável BOT_TOKEN não configurada no Render!");
    process.exit(1);
}

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
        try {
            const qrImage = await QRCode.toDataURL(latestQR);
            res.send(`
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <!-- ATUALIZA A PÁGINA SOZINHA A CADA 15 SEGUNDOS -->
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

// Inicia o servidor Web para o Render não derrubar o bot
app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Web rodando na porta ' + (process.env.PORT || 3000));
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
            latestQR = qr; // Salva o QR para a página web
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

// ==========================================
// COMANDOS DO TELEGRAM
// ==========================================
bot.start((ctx) => {
    ctx.reply('Bem-vindo ao Painel!\n\nPara enviar mensagens use:\n/enviar 5511999999999 Sua mensagem aqui');
});

bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso correto: /enviar 5511999999999 Sua mensagem aqui');

    const number = args[0].replace(/\D/g, ''); // Remove tudo que não é número
    const message = args.slice(1).join(' ');

    if (!sock) return ctx.reply('❌ WhatsApp ainda não está conectado. Acesse a página /qr no seu navegador.');

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Mensagem enviada para ${number} com sucesso!`);
    } catch (error) {
        console.error(error);
        ctx.reply('❌ Erro ao enviar mensagem. Verifique se o número tem WhatsApp.');
    }
});

// Inicia o bot do Telegram
bot.launch().then(() => console.log('🤖 Bot do Telegram iniciado!'))
    .catch((err) => console.error('Erro ao iniciar o bot:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
