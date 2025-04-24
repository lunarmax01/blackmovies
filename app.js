require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMINS ? process.env.ADMINS.split(',').map(id => parseInt(id)) : [];
const bot = new TelegramBot(TOKEN, { polling: true });
const Film = require('./Film');
const searchFilms = require('./searchFilms');

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB ulandi!'))
.catch(err => console.error('MongoDB ulanish xatosi:', err));

const movieSchema = new mongoose.Schema({
  number: Number,
  title: String,
  videoId: String,
});

const Movie = mongoose.model('Movie', movieSchema);

const channelSchema = new mongoose.Schema({
  channelUsername: String,
});

const Channel = mongoose.model('Channel', channelSchema);

const userChannelSchema = new mongoose.Schema({
  userId: Number,
  selectedChannels: [String],
});

const UserChannel = mongoose.model('UserChannel', userChannelSchema);

async function checkSubscription(chatId) {
  try {
    const channels = await Channel.find();
    for (const ch of channels) {
      const member = await bot.getChatMember(ch.channelUsername, chatId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Obuna tekshirishda xato:', error);
    return false;
  }
}

async function sendSubscriptionMessage(chatId) {
  const channels = await Channel.find();
  const buttons = channels.map(ch => [{ text: `Kanalga kirish`, url: `https://t.me/${ch.channelUsername.replace('@', '')}` }]);
  buttons.push([{ text: '✅ Obuna bo‘ldim', callback_data: 'check_subscription' }]);
  return bot.sendMessage(chatId, `Botdan foydalanish uchun quyidagi kanallarga a'zo bo'ling:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const isSubscribed = await checkSubscription(chatId);
  const isAdmin = ADMIN_IDS.includes(msg.from.id);
  bot.setMyCommands([
    { command: '/start', description: 'Botni ishga tushirish' },
    { command: '/films', description: '🎬 Eng so‘nggi filmlarni ko‘rish' },
    { command: '/search', description: '🔍 Film nomi bo‘yicha qidirish' },
    { command: '/download', description: '📥 Filmni yuklab olish' },
    { command: '/about', description: 'ℹ️ Biz haqimizda maʼlumot' },
    { command: '/settings', description: '⚙️ Sozlamalarni o‘zgartirish' },
  ]);  

  if (!isSubscribed) return sendSubscriptionMessage(chatId);

  const keyboard = isAdmin
    ? [[{ text: '📂 Kino qo‘shish' }, { text: '📜 Kanal qo‘shish' }], [{ text: '🎬 Kino qidirish' }]]
    : [[{ text: '🎬 Kino qidirish' }]];

  bot.sendMessage(chatId, 'Xush kelibsiz! Quyidagi menyudan kerakli bo‘limni tanlashingiz mumkun.', {
    reply_markup: { keyboard, resize_keyboard: true }
  });
});

let isAddingChannel = false;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = ADMIN_IDS.includes(msg.from.id);
    
    if (msg.text === '📜 Kanal qo‘shish') {
        if (!isAdmin) {
            return bot.sendMessage(chatId, "⛔ Sizda ushbu amalni bajarish uchun ruxsat yo‘q!");
        }
        
        if (isAddingChannel) {
            return bot.sendMessage(chatId, "⚠️ Hozirda kanal qo‘shish jarayoni aktiv. Avvalgi jarayonni tugating yoki bekor qiling.");
        }
        
        isAddingChannel = true;
        bot.sendMessage(chatId, "Yangi kanal foydalanuvchi nomini (@username) kiriting:", {
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_channel" }]]
            }
        });
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'cancel_channel') {
        if (!isAddingChannel) return;
        
        isAddingChannel = false;
        bot.answerCallbackQuery(query.id);
        return bot.sendMessage(chatId, "❌ Kanal qo‘shish bekor qilindi. Qayta qo‘shish uchun '📜 Kanal qo‘shish' tugmasini bosing.");
    }
});

bot.on('message', async (msg) => {
    if (!isAddingChannel || msg.text.startsWith('@') === false) return;
    
    const chatId = msg.chat.id;
    const channelUsername = msg.text.trim();
    
    if (!channelUsername.startsWith('@')) {
        isAddingChannel = false;
        return bot.sendMessage(chatId, "❌ Noto‘g‘ri format! Kanal @ bilan boshlanishi kerak.");
    }
    
    try {
        const existingChannel = await Channel.findOne({ channelUsername });
        if (existingChannel) {
            isAddingChannel = false;
            return bot.sendMessage(chatId, "⚠️ Bu kanal allaqachon qo‘shilgan!");
        }
        
        await Channel.create({ channelUsername });
        bot.sendMessage(chatId, `✅ Kanal qo‘shildi: ${channelUsername}`);
    } catch (error) {
        bot.sendMessage(chatId, "❌ Xatolik yuz berdi, iltimos qayta urinib ko‘ring.");
    } finally {
        isAddingChannel = false;
    }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (query.data.startsWith('select_')) {
    const channelUsername = query.data.replace('select_', '');
    await UserChannel.findOneAndUpdate({ userId: chatId }, { selectedChannels: [channelUsername] }, { upsert: true });
    bot.sendMessage(chatId, `✅ ${channelUsername} kanali tanlandi.`);
  }
  if (query.data === 'check_subscription') {
    const isSubscribed = await checkSubscription(chatId);
    if (isSubscribed) {
      bot.sendMessage(chatId, '✅ Obuna tasdiqlandi! Endi botdan foydalanishingiz mumkin.');
    } else {
      bot.answerCallbackQuery(query.id, { text: "🚫 Hali ham obuna bo‘lmadingiz. Iltimos, barcha kanallarga a‘zo bo‘ling." });
    }
  }
});



const searchChannelSchema = new mongoose.Schema({
    channelUsername: String,
  });
  
  const SearchChannel = mongoose.model('SearchChannel', searchChannelSchema);
  
  let isAddingSearchChannel = new Map();
  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = ADMIN_IDS.includes(msg.from.id);
  
    if (msg.text === '🎬 Kino qidirish' && isAdmin) {
      const existingChannel = await SearchChannel.findOne();
      
      if (existingChannel) {
        bot.sendMessage(chatId, `🔍 Hozirgi kanal: ${existingChannel.channelUsername}\n\n⬇️ Quyidagi tugmalar orqali kanalni boshqaring:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🗑 Kanalni o‘chirish", callback_data: "delete_search_channel" }],
              [{ text: "➕ Yangi kanal qo‘shish", callback_data: "add_search_channel" }]
            ]
          }
        });
      } else {
        bot.sendMessage(chatId, "🔍 Kino qidirish uchun kanal yo‘q! Yangi kanal qo‘shing:", {
          reply_markup: {
            inline_keyboard: [[{ text: "➕ Yangi kanal qo‘shish", callback_data: "add_search_channel" }]]
          }
        });
      }
    }
  });
  
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
  
    if (query.data === "add_search_channel") {
      if (isAddingSearchChannel.get(chatId)) {
        return bot.sendMessage(chatId, "⚠️ Avvalgi jarayon tugatilmagan! Iltimos, avval kanalni kiriting yoki bekor qiling.");
      }
  
      isAddingSearchChannel.set(chatId, true);
      bot.sendMessage(chatId, "🆕 Yangi kanal foydalanuvchi nomini (@username) kiriting:", {
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_add_channel" }]]
        }
      });
    }
  
    if (query.data === "delete_search_channel") {
      await SearchChannel.deleteMany({});
      bot.sendMessage(chatId, "🗑 Kanal o‘chirildi. Endi yangi kanal qo‘shishingiz mumkin.");
    }
  
    if (query.data === "cancel_add_channel") {
      isAddingSearchChannel.delete(chatId);
      bot.sendMessage(chatId, "❌ Kanal qo‘shish bekor qilindi.");
    }
  });
  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
  
    if (isAddingSearchChannel.get(chatId) && msg.text.startsWith('@')) {
      const channelUsername = msg.text.trim();
  
      const existingChannel = await SearchChannel.findOne();
      if (existingChannel) {
        await SearchChannel.deleteMany({});
      }
  
      await SearchChannel.create({ channelUsername });
      bot.sendMessage(chatId, `✅ Kino qidirish uchun kanal qo‘shildi: ${channelUsername}`);
  
      isAddingSearchChannel.delete(chatId);
    }
  });
  
  // 🎬 Kino qidirish tugmasi bosilganda admin uchun
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.text === '🎬 Kino qidirish') {
      const existingChannel = await SearchChannel.findOne();
  
      if (!existingChannel) {
        return bot.sendMessage(chatId, "❌ Hozircha kino qidirish uchun kanal yo‘q!");
      }
    }
  });

//   kino qoshish uchun 
  let addingMovies = {};
  let addingMovie = new Map();
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = ADMIN_IDS.includes(msg.from.id);
    const isSubscribed = await checkSubscription(chatId);
    
    if (!isSubscribed) return sendSubscriptionMessage(chatId);
  
    if (msg.text === '📂 Kino qo‘shish') {
      if (!isAdmin) {
        return bot.sendMessage(chatId, "⛔ Sizda ushbu amalni bajarish uchun ruxsat yo‘q!");
      }
      if (addingMovies[chatId] || addingMovie.get(chatId)) {
        return bot.sendMessage(chatId, "⚠️ Hozirda kino qo‘shish jarayoni aktiv. Avvalgi jarayonni tugating yoki bekor qiling.");
      }
      addingMovies[chatId] = { step: 1 };
      bot.sendMessage(chatId, "Kino raqamini kiriting:", {
        reply_markup: { inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "cancel_movie" }]] }
      });
    } else if (addingMovies[chatId]?.step === 1) {
      const number = parseInt(msg.text.trim());
      if (isNaN(number)) return bot.sendMessage(chatId, "❌ Noto‘g‘ri raqam! Son kiriting.");
      
      try {
        const existingMovie = await Movie.findOne({ number });
        if (existingMovie) {
          return bot.sendMessage(chatId, `⚠️ ${number}-raqamli kino allaqachon mavjud. Uni o‘chirmoqchimisiz?`, {
            reply_markup: { inline_keyboard: [[{ text: "🗑 O‘chirish", callback_data: `delete_movie_${number}` }], [{ text: "❌ Bekor qilish", callback_data: "cancel_movie" }]] }
          });
        }
        addingMovies[chatId] = { step: 2, number };
        bot.sendMessage(chatId, "Kino nomini kiriting:");
      } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ Xatolik yuz berdi, iltimos, qayta urinib ko‘ring.");
      }
    } else if (addingMovies[chatId]?.step === 2) {
      addingMovies[chatId].title = msg.text.trim();
      addingMovies[chatId].step = 3;
      bot.sendMessage(chatId, "Kino videosini yuboring:");
    } else if (addingMovies[chatId]?.step === 3 && msg.video) {
      const { number, title } = addingMovies[chatId];
      try {
        await Movie.create({ number, title, videoId: msg.video.file_id });
        delete addingMovies[chatId];
        bot.sendMessage(chatId, `✅ Kino muvaffaqiyatli qo‘shildi:
  📽 ${title} (Raqam: ${number})`);
      } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ Kino qo‘shishda xatolik yuz berdi.");
      }
    }
  });
  
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    
    if (query.data === "cancel_movie") {
      delete addingMovies[chatId];
      return bot.sendMessage(chatId, "❌ Kino qo‘shish jarayoni bekor qilindi.");
    }
    
    if (query.data.startsWith("delete_movie_")) {
      const number = parseInt(query.data.split("_")[2]);
      try {
        const movie = await Movie.findOneAndDelete({ number });
        if (!movie) return bot.sendMessage(chatId, "❌ Ushbu raqam bo‘yicha kino topilmadi.");
        bot.sendMessage(chatId, `✅ Kino o‘chirildi: ${movie.title}`);
      } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ Kino o‘chirishda xatolik yuz berdi.");
      }
    }
  });

  bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!msg.text) return; // Agar msg.text undefined bo'lsa, hech narsa qilmaydi

        const text = msg.text.trim();

        if (!/^\d+$/.test(text)) return; // Agar faqat son bo'lmasa, javob bermaydi
        if (ADMIN_IDS.includes(userId)) return; // Agar admin bo'lsa, hech narsa qilmaydi

        const movie = await Movie.findOne({ number: parseInt(text) });

        if (!movie) {
            return bot.sendMessage(chatId, "❌ Ushbu raqam bo‘yicha kino topilmadi.");
        }

        if (!movie.videoId) {
            return bot.sendMessage(chatId, "⚠️ Video ma'lumotlari topilmadi.");
        }

        bot.sendVideo(chatId, movie.videoId, { 
            caption: `📽 *${movie.title}*`, 
            parse_mode: "Markdown" 
        });

    } catch (error) {
        console.error("Xatolik yuz berdi:", error);
        bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko‘ring.");
    }
});

// About 

bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;

  const text = `
🖤 *BlackMovies Bot* — sizning sevimli filmlaringiz uchun yagona manba!

🎬 Bu yerda siz:
• Eng so‘nggi va mashhur filmlarni topasiz  
• Qidiruv orqali istalgan filmni oson topasiz  
• Yuqori sifatli formatlarda yuklab olishingiz mumkin

📌 Bizning maqsadimiz — sizga eng qulay va tezkor kino tajribasini taqdim etish!

📥 Taklif yoki muammo bo‘lsa, bog‘laning: [Admin bilan bog'lanish](https://t.me/lunar_web)
`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// films


bot.onText(/\/films/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const films = await Film.find().sort({ createdAt: -1 }).limit(5); // oxirgi 5 ta film

    if (films.length === 0) {
      return bot.sendMessage(chatId, '📭 Hozircha hech qanday film mavjud emas.');
    }

    let text = `🎬 *Eng so‘nggi yuklangan filmlar:*\n\n`;

    films.forEach((film, index) => {
      text += `${index + 1}. 🎞 *${film.title}* (${film.year}) — ${film.genre}\n`;
    });

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.');
  }
});


// search

bot.on('inline_query', async (query) => {
  const searchText = query.query.trim();

  if (!searchText) return;

  // Bu yerda sizning film ma'lumotlaringiz bazasidan qidiruv amalga oshiriladi
  const results = await searchFilms(searchText); // searchFilms - siz yaratgan qidiruv funksiyasi

  const inlineResults = results.map((film, index) => ({
    type: 'article',
    id: String(index),
    title: film.title,
    description: `${film.year} • ${film.genre}`,
    input_message_content: {
      message_text: `🎬 *${film.title}* (${film.year})\n📂 Janr: ${film.genre}`,
      parse_mode: 'Markdown'
    }
  }));

  bot.answerInlineQuery(query.id, inlineResults, { cache_time: 0 });
});

bot.onText(/\/search/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, '🔍 Film qidirishni boshlash uchun quyidagi tugmani bosing:', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔎 Qidiruvni boshlash',
            switch_inline_query_current_chat: ''
          }
        ]
      ]
    }
  });
});