const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');



// Configura o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Configura o servidor Express
const app = express();
const PORT = process.env.PORT || 3000;
let qrGenerated = false;

// Gera e exibe o QR Code para login
client.on('qr', async (qr) => {
    console.log('QR Code gerado. Acesse /qrcode para visualizar.');
    const qrPath = path.join(__dirname, 'qrcode.png');
    console.log('QR Code gerado. Escaneie abaixo (formato texto):');
    console.log(qr); // QR em texto ASCII para escaneamento direto
    // Salvar o QR Code como imagem
    await qrcode.toFile(qrPath, qr);
    qrGenerated = true;
});

// Rota para exibir o QR Code
app.get('/qrcode', (req, res) => {
    const qrPath = path.join(__dirname, 'qrcode.png');
    if (qrGenerated && fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.send('QR Code ainda não gerado. Aguarde...');
    }
});

app.get('/reset-session', (req, res) => {
    // Apaga o arquivo de sessão
    const sessionPath = path.join(__dirname, 'session.json');
    if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
    }

    // Reinicia o cliente do WhatsApp
    client.destroy().then(() => {
        client.initialize();
        res.send('Sessão reiniciada. O QR Code será gerado novamente.');
    }).catch(err => {
        res.status(500).send('Erro ao reiniciar a sessão: ' + err.message);
    });
});


// Confirmação de conexão
client.on('ready', () => {
    console.log('Bot conectado e pronto para uso!');
});

// Lida com mensagens recebidas
client.on('message', async (message) => {
    try {
        // Filtra mensagens que começam com "!"
        if (!message.body.startsWith('!')) return;

        // Obtém informações do chat
        const chat = await message.getChat();
        const isGroup = chat.id._serialized.endsWith('@g.us'); // Verifica explicitamente se é grupo

        // Loga detalhes do comando no terminal
        console.log(`Comando recebido de ${message.from}: ${message.body}`);
        console.log(`Informações do chat:`);
        console.log(`- Nome: ${chat.name || 'Privado'}`);
        console.log(`- ID: ${chat.id._serialized}`);
        console.log(`- Tipo de chat: ${isGroup ? 'Grupo' : 'Privado'}`);

        // Comando !all
        if (message.body.startsWith('!all')) {
            if (isGroup) {
                console.log(`Comando "!all" detectado no grupo: ${chat.name}`);
                const messages = await chat.fetchMessages({ limit: 50 });
                const participants = Array.from(
                    new Set(messages.map((msg) => msg.author || msg.from))
                ).filter((id) => id !== chat.id._serialized);

                if (participants.length > 0) {
                    const mentions = await Promise.all(
                        participants.map((id) => client.getContactById(id))
                    );
                    const mentionText = '📢 Menção a todos os membros ativos no grupo:';
                    await chat.sendMessage(mentionText, { mentions });
                    console.log(`Menção enviada para os participantes do grupo: ${chat.name}`);
                } else {
                    console.error('Nenhum participante identificado pelas mensagens.');
                    message.reply('Não foi possível acessar os participantes do grupo.');
                }
            } else {
                message.reply('O comando "!all" só funciona em grupos.');
                console.log('Comando "!all" usado em um chat privado.');
            }
        }

        // Comando !ban
        else if (message.body.startsWith('!ban') && isGroup) {
            const mentions = await message.getMentions(); // Obtém as menções na mensagem
            if (mentions.length === 0) {
                message.reply('Uso: !ban @usuario. Certifique-se de mencionar o participante que deseja banir.');
                return;
            }

            try {
                const participantsToBan = mentions.map(user => user.id._serialized); // IDs dos usuários mencionados
                console.log(`Tentando banir os seguintes usuários: ${participantsToBan}`);

                // Número específico a ser protegido (substitua pelo número que deseja proteger)
                const protectedNumber = '5511999999999@c.us'; // Insira o número no formato correto do WhatsApp

                // Obter informações do próprio bot
                const botNumber = (await client.getMe()).id._serialized;

                for (const participantId of participantsToBan) {
                    try {
                        // Verifica se está tentando banir o próprio bot ou o número protegido
                        if (participantId === botNumber || participantId === protectedNumber) {
                            message.reply('Você não tem poder aqui.');
                            console.log(`Tentativa de banir o bot ou o número protegido foi bloqueada: ${participantId}`);
                            continue;
                        }

                        // Método direto para remover participantes
                        await client.pupPage.evaluate(
                            (groupId, participantId) => {
                                window.Store.WapQuery.removeParticipants(groupId, [participantId]);
                            },
                            chat.id._serialized, participantId
                        );

                        console.log(`Participante banido com sucesso: ${participantId}`);
                        message.reply(`Participante ${participantId} foi banido com sucesso.`);
                    } catch (error) {
                        console.error(`Erro ao tentar banir o participante ${participantId}:`, error);
                        message.reply(`Erro ao tentar banir o participante ${participantId}. Certifique-se de que o bot é administrador.`);
                    }
                }
            } catch (error) {
                console.error('Erro ao tentar banir participantes:', error);
                message.reply('Ainda não meu patrão');
            }
        }

        // Comando !sticker
        else if (message.body.startsWith('!sticker') && message.hasMedia) {
            try {
                const media = await message.downloadMedia();
                if (!media) {
                    message.reply('Não consegui processar a mídia. Certifique-se de que está enviando uma imagem ou vídeo.');
                    return;
                }

                await client.sendMessage(message.from, media, {
                    sendMediaAsSticker: true,
                    stickerAuthor: "DSA",
                    stickerName: "-_-"
                });

                console.log('Sticker gerado com sucesso.');
            } catch (error) {
                console.error('Erro ao criar o sticker:', error);
                message.reply('Houve um erro ao criar o sticker. Tente novamente.');
            }
        } else if (message.body.startsWith('!sticker')) {
            message.reply('Envie uma imagem ou vídeo junto com o comando "!sticker" para criar um sticker.');
        }

        // Comando !ping
        else if (message.body === '!ping') {
            message.reply('Pong! Estou funcionando.');
            console.log('Comando "!ping" recebido e respondido.');
        }

        // Comando !help
        else if (message.body === '!help') {
            message.reply(
                'Comandos disponíveis:\n' +
                '!all - Marca todos os membros ativos no grupo (apenas em grupos)\n' +
                '!ban @usuario - Remove um participante mencionado do grupo (o bot precisa ser administrador)\n' +
                '!sticker - Cria um sticker a partir de uma imagem ou vídeo enviados\n' +
                '!ping - Verifica o status do bot\n' +
                '!help - Lista de comandos.'
            );
            console.log('Comando "!help" recebido e respondido.');
        }

        // Comando desconhecido
        else {
            console.log(`Comando desconhecido recebido: ${message.body}`);
        }
    } catch (error) {
        console.error('Erro ao processar a mensagem:', error);
    }
});

// Inicializa o cliente do WhatsApp
client.initialize();

// Inicia o servidor Express
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}. Acesse http://localhost:${PORT}/qrcode para ver o QR Code.`);
});
