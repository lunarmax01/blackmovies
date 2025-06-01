require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMINS ? process.env.ADMINS.split(',').map(id => parseInt(id)) : [];
const bot = new TelegramBot(TOKEN, { polling: true });
const Movies = require('./Movies');
const user = require('./user');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB ulandi!'))
  .catch(err => console.error('MongoDB ulanish xatosi:', err));

const Movie = Movies

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
  const isAdmin = ADMIN_IDS.includes(msg.from.id);

  try {
    const existingUser = await user.findOne({ chatId });

    if (!existingUser) {
      await user.create({
        chatId: chatId,
        first_name: msg.from.first_name || '',
        username: msg.from.username || ''
      });
      console.log(`Yangi foydalanuvchi qo‘shildi: ${chatId}`);
    } else {
      console.log(`Foydalanuvchi mavjud: ${chatId}`);
    }
  } catch (error) {
    console.error('User bazaga yozishda xatolik:', error);
  }


  bot.setMyCommands([
    { command: '/start', description: 'Botni ishga tushirish' },
    { command: '/films', description: '🎬 Eng so‘nggi filmlarni ko‘rish' },
    { command: '/about', description: 'ℹ️ Biz haqimizda maʼlumot' },
    { command: '/contact_admin', description: 'ℹ️ Adminga murojaat yuborish' }
  ]);

  let keyboard;

  if (isAdmin) {
    // Adminga har doim tugmalar ko'rsatiladi
    keyboard = [[{ text: '📂 Kino qo‘shish' }, { text: '📜 Kanal qo‘shish' }], [{ text: '🎬 Kino qidirish' }]];
  } else {
    // User uchun avval obuna bo‘lishni tekshiramiz
    const isSubscribed = await checkSubscription(chatId);
    if (isSubscribed) {
      keyboard = [[{ text: '🎬 Kino qidirish' }]];
    } else {
      // Obuna bo'lmaganlarga kino qidirish tugmasini bermaymiz, xohlasangiz bo'sh klaviatura yoki boshqa tugmalar qo'yishingiz mumkin
      keyboard = [];
    }
  }

  bot.sendMessage(chatId, '🎬 Black Movies botga xush kelibsiz!', {
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
  const text = msg.text;

  if (!text) return; // Agar xabar yo‘q bo‘lsa, to‘xtat

  // Admin kanal qo‘shyapti
  if (isAddingSearchChannel.get(chatId) && text.startsWith('@')) {
    const channelUsername = text.trim();

    await SearchChannel.deleteMany({}); // Eski kanallarni tozalash
    await SearchChannel.create({ channelUsername }); // Yangi kanal qo‘shish

    await bot.sendMessage(chatId, `✅ Kino qidirish uchun kanal qo‘shildi: ${channelUsername}`);
    isAddingSearchChannel.delete(chatId);
    return;
  }

  // 🎬 Kino qidirish tugmasi bosilganda
  if (text === '🎬 Kino qidirish') {
    const isSubscribed = await checkSubscription(chatId);
    if (!isSubscribed) {
      return (chatId);
    }

    const existingChannel = await SearchChannel.findOne();

    if (!existingChannel) {
      return bot.sendMessage(chatId, "❌ Hozircha kino qidirish uchun kanal yo‘q!");
    }

    const channelUsername = existingChannel.channelUsername.replace('@', '');

    await bot.sendMessage(chatId, `🎥 Kino topish uchun kanalga o'ting:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎬 Kanalga o'tish", url: `https://t.me/${channelUsername}` }
          ]
        ]
      }
    });

    return;
  }
});

// Admin kanal qo'shishni boshlashi uchun
bot.onText(/\/addsearchchannel/, async (msg) => {
  const chatId = msg.chat.id;

  isAddingSearchChannel.set(chatId, true);
  await bot.sendMessage(chatId, "📥 Kino qidirish uchun kanal username'ini yuboring (masalan, @blackmovi).");
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

// kino qidirish raqam orqalik foydalanuvchi
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
bot.onText(/\/films/, async (msg) => {
  const chatId = msg.chat.id;
  const isAdmin = ADMIN_IDS.includes(msg.from.id); // Admin bo‘lsa ham tekshirishni o‘chirish mumkin, agar adminlarga erkinlik kerak bo‘lsa

  // Admin bo‘lmagan foydalanuvchilar uchun obuna tekshirish
  if (!isAdmin) {
    const isSubscribed = await checkSubscription(chatId);
    if (!isSubscribed) {
      return (chatId); // Obuna bo‘lishni so‘raymiz va keyin funksiyani to‘xtatamiz
    }
  }

  try {
    let movies = await Movies.find().sort({ number: -1 }); // movies kolleksiyasidan o'qish

    if (movies.length === 0) {
      return bot.sendMessage(chatId, '📭 Hozircha hech qanday film mavjud emas.');
    }

    if (movies.length > 5) {
      movies = movies.slice(0, 5); // Faqat 5 ta filmni ko'rsatish
    }

    for (const movie of movies) {
      let caption = `🎬 *${movie.title}*`;

      if (movie.videoId && movie.videoId.trim() !== '') {
        await bot.sendVideo(chatId, movie.videoId, {
          caption,
          parse_mode: 'Markdown'
        });
      } else {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
      }
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.');
  }
});
// Reklama rejimi flag
let reklamaMode = false;

// Admin reklama rejimini yoqish uchun komanda
bot.onText(/\/reklama/, (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  reklamaMode = true;
  bot.sendMessage(msg.chat.id, "📨 Reklama uchun media (matn, rasm, video, audio, animatsiya, voice, document) yuboring. Reklama yuborish uchun shu xabarni yuboring.");
});

// Reklama uchun kelgan xabarni barcha userlarga yuborish
bot.on('message', async (msg) => {
  // Agar reklama rejimi o‘chirilgan bo‘lsa yoki xabar komandasi bo‘lsa to‘xtatamiz
  if (!reklamaMode) return;
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  if (msg.text && msg.text.startsWith('/reklama')) return;

  reklamaMode = false; // Reklama rejimini o‘chirib qo‘yamiz

  try {
    const users = await user.find({});
    console.log(`🔔 Reklama uchun foydalanuvchilar soni: ${users.length}`);

    // Hammasi ok bo‘lsa, reklama yuboramiz
    for (const u of users) {
      try {
        if (msg.photo) {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          await bot.sendPhoto(u.chatId, photoId, { caption: msg.caption || "" });
        } else if (msg.video) {
          await bot.sendVideo(u.chatId, msg.video.file_id, { caption: msg.caption || "" });
        } else if (msg.animation) {
          await bot.sendAnimation(u.chatId, msg.animation.file_id, { caption: msg.caption || "" });
        } else if (msg.audio) {
          await bot.sendAudio(u.chatId, msg.audio.file_id, { caption: msg.caption || "" });
        } else if (msg.voice) {
          await bot.sendVoice(u.chatId, msg.voice.file_id, { caption: msg.caption || "" });
        } else if (msg.document) {
          await bot.sendDocument(u.chatId, msg.document.file_id, { caption: msg.caption || "" });
        } else if (msg.text) {
          await bot.sendMessage(u.chatId, msg.text);
        }
      } catch (e) {
        console.log(`⚠️ Foydalanuvchi ${u.chatId} ga reklama yuborishda xato:`, e.message);
      }
    }

    bot.sendMessage(msg.chat.id, "✅ Reklama barcha foydalanuvchilarga yuborildi.");
  } catch (error) {
    console.log('Reklama yuborishda xatolik:', error.message);
    bot.sendMessage(msg.chat.id, '❌ Reklama yuborishda xatolik yuz berdi.');
  }
});

// --- Murojaat uchun model ---
const contactSchema = new mongoose.Schema({
  userId: Number,
  username: String,
  firstName: String,
  lastName: String,
  message: String,
  date: { type: Date, default: Date.now },
  viewed: { type: Boolean, default: false }
});

const Contact = mongoose.model('Contact', contactSchema);

// --- Foydalanuvchi murojaat yuborishi ---
bot.onText(/\/contact_admin/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Iltimos, adminga yozmoqchi bo‘lgan xabaringizni yuboring. Xabaringizni yozing:");

  bot.once('message', async (replyMsg) => {
    if (replyMsg.text && replyMsg.chat.id === chatId) {
      try {
        const contact = new Contact({
          userId: replyMsg.from.id,
          username: replyMsg.from.username || 'NoUsername',
          firstName: replyMsg.from.first_name || '',
          lastName: replyMsg.from.last_name || '',
          message: replyMsg.text,
          viewed: false
        });
        await contact.save();

        bot.sendMessage(chatId, "Xabaringiz adminga yuborildi!");
      } catch (error) {
        bot.sendMessage(chatId, "Xatolik yuz berdi, iltimos keyinroq qayta urinib ko‘ring.");
        console.error(error);
      }
    }
  });
});

// --- Admin murojaatlarni ko‘rishi ---
bot.onText(/\/view_contacts/, async (msg) => {
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(userId, "Sizda bu komandani ishlatish uchun ruxsat yo'q.");
    return;
  }

  try {
    const contacts = await Contact.find({ viewed: false }).sort({ date: -1 });

    if (contacts.length === 0) {
      bot.sendMessage(userId, "Hozircha ko‘rilmagan murojaatlar yo‘q.");
      return;
    }

    for (const contact of contacts) {
      await bot.sendMessage(userId,
        `📩 Yangi murojaat:\n` +
        `👤 Foydalanuvchi: @${contact.username} (${contact.firstName} ${contact.lastName || ''})\n` +
        `🆔 User ID: ${contact.userId}\n` +
        `📅 Vaqt: ${contact.date.toLocaleString()}\n` +
        `📨 Xabar: ${contact.message}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✉️ Javob yozish', callback_data: `reply_${contact._id}` },
              { text: '❌ O‘chirish', callback_data: `delete_${contact._id}` }
            ]
          ]
        }
      });

      contact.viewed = true;
      await contact.save();
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(userId, "Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko‘ring.");
  }
});

// --- Callback handler ---
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!ADMIN_IDS.includes(query.from.id)) {
    return bot.answerCallbackQuery(query.id, { text: "Sizda ruxsat yo'q.", show_alert: true });
  }

  // Javob yozish
  if (data.startsWith('reply_')) {
    const contactId = data.split('_')[1];

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return bot.editMessageText("Murojaat topilmadi yoki o‘chirilgan.", {
        chat_id: chatId,
        message_id: messageId
      });
    }

    bot.sendMessage(chatId, `✍️ @${contact.username} foydalanuvchisiga yozmoqchi bo‘lgan javobingizni kiriting:`);

    bot.once('message', async (replyMsg) => {
      if (replyMsg.text) {
        try {
          await bot.sendMessage(contact.userId,
            `👮‍♂️ Admin sizga javob yozdi:\n\n"${replyMsg.text}"`
          );
          await bot.sendMessage(chatId, "✅ Javob foydalanuvchiga yuborildi.");
        } catch (err) {
          console.error(err);
          bot.sendMessage(chatId, "❌ Javob yuborib bo‘lmadi. Ehtimol foydalanuvchi botni bloklagan.");
        }
      }
    });
  }

  // O‘chirish
  if (data.startsWith('delete_')) {
    const contactId = data.split('_')[1];

    try {
      await Contact.findByIdAndDelete(contactId);
      bot.editMessageText("✅ Murojaat o‘chirildi.", {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ O‘chirishda xatolik yuz berdi.");
    }
  }

  bot.answerCallbackQuery(query.id);
});

// --- Har 1 soatda adminlarga ogohlantirish yuborish ---
setInterval(async () => {
  try {
    const count = await Contact.countDocuments({ viewed: false });
    if (count > 0) {
      ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId,
          `🔔 Sizda jami ${count} ta ko‘rilmagan murojaat bor. /view_contacts komandasini ishlatib, murojaatlarni ko‘ring.`
        );
      });
    }
  } catch (err) {
    console.error('Eslatma yuborishda xatolik:', err);
  }
}, 3600000);

// --- Faqat adminlarga komandalar ---
ADMIN_IDS.forEach(adminId => {
  bot.setMyCommands([
    { command: '/start', description: 'Botni ishga tushirish' },
    { command: '/view_contacts', description: 'Murojatlarni ko‘rish' },
    { command: '/reklama', description: 'Reklama berish' }
  ], { scope: { type: 'chat', chat_id: adminId } });
});

