import { Telegraf } from 'telegraf';
// Importa fetchLatestWaWebVersion em vez de fetchLatestBaileysVersion
import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = pkg;
import express from 'express';
import pino from 'pino';
import fs from 'fs';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("ERRO: Variável BOT_TOKEN não configurada!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
let sock = null;

app.get('/', (req, res) => {
    res.send('<h1>Bot rodando! Use /parear no Telegram.</h1>');
});
app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Web rodando...');
});

async function connectWithPairingCode(phoneNumber, ctx) {
    try {
        if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        // 🔥 USA A FUNÇÃO CORRETA PARA OBTER A VERSÃO ATUAL DO WHATSAPP WEB
        const { version } = await fetchLatestWaWebVersion();
        console.log(`Usando WhatsApp Web v${version.join('.')}`);

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' })
        });

        if (!sock.authState.creds.registered) {
            // Aguarda um pequeno delay para o socket estar pronto
            setTimeout(async () => {
                try {
                    // 🔥 GARANTE QUE APENAS NÚMEROS SEJAM ENVIADOS
                    const cleanNumber = phoneNumber.replace(/\D/g, ''); 
                    const code = await sock.requestPairingCode(cleanNumber);
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    ctx.reply(`🔑 *Código de pareamento:* \n\n👉 \`${formattedCode}\`\n\n1. Abra o WhatsApp no celular.\n2. Vá em *Dispositivos Conectados* > *Conectar Dispositivo*.\n3. Escolha *Conectar com número de telefone*.\n4. Digite o código.`, { parse_mode: 'Markdown' });
                    console.log(`Código gerado para ${cleanNumber}: ${code}`);
                } catch (err) {
                    console.error("Erro ao gerar código:", err);
                    ctx.reply("❌ Erro ao gerar o código.");
                }
            }, 3000);
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                console.log('Conexão fechada.');
            } else if (connection === 'open') {
                console.log('✅ WhatsApp Conectado!');
                ctx.reply('✅ *WhatsApp conectado com sucesso!* Use /enviar.', { parse_mode: 'Markdown' });
            }
        });
        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error("Erro na conexão:", error);
        ctx.reply("❌ Erro interno.");
    }
}

bot.start((ctx) => {
    ctx.reply('Bem-vindo!\nEnvie: /parear 573166086923 (DDI + DDD + Número)');
});

bot.command('parear', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) return ctx.reply('Uso: /parear 573166086923');
    const phoneNumber = args[0].replace(/\D/g, ''); // Limpa o número aqui também
    if (phoneNumber.length < 10) return ctx.reply('Número inválido.');
    
    ctx.reply(`⏳ Gerando código para ${phoneNumber}...`);
    await connectWithPairingCode(phoneNumber, ctx);
});

bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso: /enviar 5511999999999 Mensagem');
    const number = args[0].replace(/\D/g, '');
    const message = args.slice(1).join(' ');

    if (!sock || !sock.authState.creds.registered) return ctx.reply('❌ Use /parear primeiro.');

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Enviado para ${number}!`);
    } catch (error) {
        ctx.reply('❌ Erro ao enviar.');
    }
});

bot.launch().then(() => console.log('🤖 Bot iniciado!'))
    .catch((err) => console.error('Erro:', err));
