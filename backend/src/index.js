require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Render corre la app detrás de un proxy — sin esto, req.ip devuelve la IP
// interna del proxy para todas las peticiones, lo que rompería el límite
// por IP del formulario público de solicitud de cuentas.
app.set('trust proxy', 1);

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
app.use('/api/platform-accounts-erp', require('./routes/platformAccountsErp'));
app.use('/api/responsiva-archive', require('./routes/responsivaArchive'));
app.use('/api/account-requests', require('./routes/accountRequests'));
app.use('/api/onboarding-requests', require('./routes/onboardingRequests'));
app.use('/api/offboarding-requests', require('./routes/offboardingRequests'));
app.use('/api/resource-requests', require('./routes/resourceRequests'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/network-layouts', require('./routes/networkLayouts'));
app.use('/api/internal-apps', require('./routes/internalApps'));
app.use('/api/printers', require('./routes/printers'));
app.use('/api/push-subscriptions', require('./routes/pushSubscriptions'));
app.use('/api/employee-auth', require('./routes/employeeAuth'));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(process.env.PORT, () =>
      console.log(`Servidor corriendo en puerto ${process.env.PORT}`)
    );
  })
  .catch((err) => console.error('Error MongoDB:', err));
