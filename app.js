const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const dotenv = require('dotenv').config();


const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const cors = require('cors');

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));

app.use(cors({
  origin: '*'
  //origin: 'https://ims-spa.web.app'
}));

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});


// Secret key for signing JWT
const secretKey = process.env.SECRET_KEY;

// Users array

const users = process.env.USERS.split(',')  ;

const client = new Client({
  authStrategy: new LocalAuth(
  ),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ]
  }
});

client.initialize();

// Socket IO
io.on('connection', function (socket) {
  socket.emit('message', 'Connecting...');


  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });


  client.on('message', msg => {
    if (msg.body == 'ping') {
      const phoneNumber = '18096019002@c.us'
      client.sendMessage(phoneNumber, "Hello World")
    }
  });


  client.on('authenticated', () => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED');
  });

  client.on('change_state', state => {
    console.log('Status: ', state);
  });

  client.on('auth_failure', function (session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    client.destroy();
    client.initialize();
  });
});

app.post('/login', (req, res) => {
  const { username } = req.body;
 
  const user = users.find((user) => user === username);

  if (!user) {
    // Return an error if authentication fails
    return res.status(401).json({ message: 'Authentication failed' });
  }

  // Generate a JWT token upon successful authentication
  const token = jwt.sign({ username: user.username }, secretKey, { expiresIn: '1h' });

  // Set the 'auth-token' header and send the token as part of the response
  res.header('auth-token', token).status(200).json({
    error: null,
    data: { token }
  });
});

// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {

  // Verify the JWT token sent in the request
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }

  //sustraer el token del header
  const tokenBearer = token.split(' ');

  jwt.verify(tokenBearer[1], secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: err });
    }
    const errors = validationResult(req).formatWith(({
      msg
    }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped()
      });
    }

    const number = req.body.number + '@c.us';
    const message = req.body.message;

    console.log(number);
    console.log(message);

    client.sendMessage(number, message).then(response => {
      res.status(200).json({
        status: true,
        response: response
      });
    }).catch(err => {
      res.status(500).json({
        status: false,
        response: err
      });
    });
  });
});

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  //const media = MessageMedia.fromFilePath('./image-example.png');
  const file = req.files.file;
  const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  // let mimetype;
  // const attachment = await axios.get(fileUrl, {
  //   responseType: 'stream'
  // }).then(response => {
  //   mimetype = response.headers['content-type'];
  //   return response.data.toString('base64');
  // });

  // const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

const findGroupByName = async function (name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat =>
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group-message', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Invalid value, you can use `id` or `name`');
    }
    return true;
  }),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No group found with name: ' + groupName
      });
    }
    chatId = group.id._serialized;
  }

  client.sendMessage(chatId, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Clearing message on spesific chat
app.post('/clear-message', [
  body('number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = req.body.number + '@c.us';

  const chat = await client.getChatById(number);

  chat.clearMessages().then(status => {
    res.status(200).json({
      status: true,
      response: status
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  })
});

server.listen(port, function () {
  console.log('App running on *: ' + port);
});
