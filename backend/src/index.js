require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
}));
app.use(express.json());

app.head('/health', (_req, res) => res.sendStatus(200));
app.get('/health', (_req, res) => res.sendStatus(200));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/audit',       require('./routes/audit'));
app.use('/api/responsiva',  require('./routes/responsiva'));
app.use('/api/gmail-accounts', require('./routes/gmailAccounts'));
app.use('/api/platform-accounts', require('./routes/platformAccounts'));
app.use('/api/responsiva-archive', require('./routes/responsivaArchive'));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(process.env.PORT, () =>
      console.log(`Servidor corriendo en puerto ${process.env.PORT}`)
    );
  })
  .catch((err) => console.error('Error MongoDB:', err));
