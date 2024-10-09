require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo'); // لتخزين الجلسات في MongoDB
const LogConfig = require('./models/LogConfig');
const Level = require('./models/Level');
const Currency = require('./models/Currency'); // استيراد نموذج العملة
const WordResponse = require('./models/WordResponse');

const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد عميل Discord
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ]
});

// تسجيل الدخول إلى Discord باستخدام توكن البوت
discordClient.login(process.env.TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Middleware
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies
app.use(express.static('public')); // Serve static files

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Specify the views directory

// Session middleware with MongoDB for persistent sessions
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }), // تخزين الجلسات في MongoDB
  cookie: { secure: false } // Change to true if using HTTPS
}));

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds', 'guilds.members.read'],
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  // تمرير حالة المستخدم إلى EJS
  res.render('index', { user: req.isAuthenticated() ? req.user : null });
});

app.get('/login', passport.authenticate('discord'));

app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
  res.redirect('/dashboard');
});

app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

app.get('/dashboard', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  try {
    const userLevelData = await Level.findOne({ userId: req.user.id });
    const userCurrencyData = await Currency.findOne({ userId: req.user.id });

    const userStats = userLevelData || {
      xp: 0,
      level: 1,
      rank: 'غير متوفر'
    };

    const userCurrency = userCurrencyData || { balance: 0 };

    // تنسيق الرصيد باستخدام دالة formatNumber
    const formattedCurrency = formatNumber(userCurrency.balance);

    res.render('dashboard', {
      user: req.user,
      userStats: {
        xp: userStats.xp,
        level: userStats.level,
        rank: userStats.rank,
        currency: formattedCurrency // إرسال العملة المنسقة
      }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/login');
  }
});

// نقطة نهاية API لجلب القنوات من السيرفر
app.get('/api/guilds/:guildId/channels', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);

  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  const channels = guild.channels.cache.map(channel => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
  }));

  res.json(channels);
});

app.get('/server/:guildId/settings', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);

  if (!guild) return res.status(404).send('Server not found');

  // جلب القنوات باستخدام ChannelType الصحيح
  const textChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice).size;

  const guildData = {
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    textChannelCount: textChannels,  // عدد الرومات الكتابية
    voiceChannelCount: voiceChannels  // عدد الرومات الصوتية
  };

  const logConfig = await LogConfig.findOne({ guildId });

  res.render('server-settings', { guild: guildData, logConfig, user: req.user });
});

app.get('/server/:guildId/responses', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);

  if (!guild) return res.status(404).send('Server not found');

  const responses = await WordResponse.find({ guildId }); // جلب الردود من قاعدة البيانات

  res.render('responses', { 
      guild: { id: guild.id, name: guild.name }, 
      user: req.user,
      responses // إرسال الردود إلى الصفحة
  });
});


// نقطة نهاية لإضافة ردود جديدة
app.post('/server/:guildId/responses', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const { trigger, response, sendReply } = req.body;
  const guildId = req.params.guildId;

  const newResponse = new WordResponse({
      guildId,
      word: trigger,
      response: response,
      sendReply: sendReply === 'true' // تحويل النص إلى Boolean
  });

  await newResponse.save();
  res.redirect(`/server/${guildId}/responses`);
});

// تحديث رد
app.post('/server/:guildId/responses/:responseId', async (req, res) => {
  const { word, response, sendReply } = req.body;
  const { guildId, responseId } = req.params;

  try {
      await WordResponse.findByIdAndUpdate(responseId, { word, response, sendReply });
      res.json({ message: 'تم تعديل الرد بنجاح!' }); // رد مخصص
  } catch (error) {
      console.error(error);
      res.json({ message: 'حدث خطأ أثناء تعديل الرد. يرجى المحاولة لاحقاً.' }); // رسالة خطأ مخصصة
  }
});

// حذف رد
app.delete('/server/:guildId/responses/:responseId', async (req, res) => {
  const { guildId, responseId } = req.params;

  try {
      await WordResponse.findByIdAndDelete(responseId);
      res.sendStatus(200); // رد ناجح
  } catch (error) {
      console.error(error);
      res.sendStatus(500); // خطأ داخلي
  }
});


app.get('/server/:guildId/create-embed', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);

  if (!guild) return res.status(404).send('Server not found');

  // جلب القنوات الكتابية فقط
  const guildChannels = guild.channels.cache
      .filter(channel => channel.type === ChannelType.GuildText)
      .map(channel => ({ id: channel.id, name: channel.name }));

  res.render('create-embed', { guild, guildChannels, user: req.user  });
});


app.post('/server/:guildId/create-embed', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const { channel, title, description, color, image, authorName, authorIcon, authorUrl, authorSideImage, footerText, footerIcon } = req.body;
  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);
  const selectedChannel = guild.channels.cache.get(channel);

  if (!selectedChannel || selectedChannel.type !== ChannelType.GuildText) {
      return res.status(400).send('Invalid channel');
  }

  const embed = {
      title: title,
      description: description,
      color: parseInt(color.replace('#', ''), 16),
      image: { url: image },
      author: {
          name: authorName,
          icon_url: authorIcon,
          url: authorUrl
      },
      footer: {
          text: footerText,
          icon_url: footerIcon
      }
  };

  // إضافة authorSideImage إلى الكائن embed كصورة جانبية
  if (authorSideImage) {
      embed.thumbnail = { url: authorSideImage }; // تعديل هنا لإضافة الصورة المصغرة
  }

  try {
      await selectedChannel.send({ embeds: [embed] });
      res.redirect(`/server/${guildId}/create-embed`);
  } catch (err) {
      console.error(err);
      res.status(500).send('Failed to send embed');
  }
});


app.get('/server/:guildId/logs', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guildId = req.params.guildId;
  const guild = discordClient.guilds.cache.get(guildId);

  if (!guild) return res.status(404).send('Server not found');

  // احصل على إعدادات اللوجات من قاعدة البيانات
  const logConfig = await LogConfig.findOne({ guildId });

  res.render('server-logs', { guild, logConfig, user: req.user });
});

// API endpoint to fetch guilds as JSON
app.get('/api/guilds', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');

  const guilds = req.user.guilds.filter(guild => {
    // تحقق إذا كان البوت موجود في السيرفر
    const botInGuild = discordClient.guilds.cache.has(guild.id);
    if (!botInGuild) return false;

    // تحقق من الصلاحيات - يجب أن يكون لديك صلاحيات الـ Administrator
    if (!guild.permissions) return false;
    const permissions = new PermissionsBitField(BigInt(guild.permissions));
    return permissions.has(PermissionsBitField.Flags.Administrator);
  });

  res.json(guilds);
});

// دالة لتحويل الأرقام الكبيرة إلى K, M, B
function formatNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B'; // 1B
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'; // 1M
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'; // 1K
  } else {
    return num.toString(); // الأرقام الصغيرة تبقى كما هي
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
