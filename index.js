import { Telegraf } from 'telegraf';
import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = pkg;
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

// Apenas para o Render saber que o app está de pé
app.get('/', (req, res) => {
    res.send('<h1>Bot rodando! Vá para o Telegram e use /parear para conectar o WhatsApp.</h1>');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor Web rodando na porta ' + (process.env.PORT || 3000));
});

// Função para conectar e gerar o código de pareamento
async function connectWithPairingCode(phoneNumber, ctx) {
    try {
        // Se já existir uma sessão antiga, apaga para garantir um código novo
        if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // Não queremos QR Code
            logger: pino({ level: 'silent' })
        });

        // Solicita o código de pareamento se não estiver logado
        if (!sock.authState.creds.registered) {
            // O Baileys precisa de um pequeno delay para o socket estar pronto
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    // Formata o código bonitinho (ex: ABCD-1234)
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    ctx.reply(`🔑 *Seu código de pareamento:* \n\n👉 \`${formattedCode}\`\n\n1. Abra o WhatsApp no seu celular.\n2. Vá em *Dispositivos Conectados* > *Conectar Dispositivo*.\n3. Escolha *Conectar com número de telefone*.\n4. Digite o código acima.`, { parse_mode: 'Markdown' });
                    console.log(`Código gerado para ${phoneNumber}: ${code}`);
                } catch (err) {
                    console.error("Erro ao gerar código:", err);
                    ctx.reply("❌ Erro ao gerar o código. Verifique o número e tente novamente.");
                }
            }, 3000);
        }

        // Monitoramento da conexão
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('Conexão fechada. Aguardando novo comando de pareamento...');
                } else {
                    console.log('Desconectado pelo usuário (Logout).');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp Conectado com sucesso!');
                ctx.reply('✅ *WhatsApp conectado com sucesso!* Agora você pode usar o comando /enviar.', { parse_mode: 'Markdown' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error("Erro na conexão:", error);
        ctx.reply("❌ Erro interno ao iniciar a conexão.");
    }
}

// ==========================================
// COMANDOS DO TELEGRAM
// ==========================================
bot.start((ctx) => {
    ctx.reply('Bem-vindo!\n\nPara conectar seu WhatsApp, envie:\n/parear 5511999999999 (seu número com DDI e DDD)');
});

// Comando para gerar o código de pareamento
bot.command('parear', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
        return ctx.reply('Uso correto: /parear 5511999999999 (Seu número com DDI e DDD)');
    }

    // Remove tudo que não for número
    const phoneNumber = args[0].replace(/\D/g, '');

    if (phoneNumber.length < 10) {
        return ctx.reply('Número inválido. Certifique-se de incluir o DDI (55) e o DDD.');
    }

    ctx.reply(`⏳ Gerando código de pareamento para ${phoneNumber}... Aguarde 3 segundos.`);
    
    // Chama a função para conectar e gerar o código
    await connectWithPairingCode(phoneNumber, ctx);
});

// Comando para enviar mensagens
bot.command('enviar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Uso: /enviar 5511999999999 Sua mensagem');
    
    const number = args[0].replace(/\D/g, '');
    const message = args.slice(1).join(' ');

    if (!sock || !sock.authState.creds.registered) {
        return ctx.reply('❌ WhatsApp não conectado. Use /parear primeiro.');
    }

    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        ctx.reply(`✅ Mensagem enviada para ${number}!`);
    } catch (error) {
        console.error(error);
        ctx.reply('❌ Erro ao enviar. Verifique o número.');
    }
});

bot.launch().then(() => console.log('🤖 Bot do Telegram iniciado!'))
    .catch((err) => console.error('Erro no Telegram:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
