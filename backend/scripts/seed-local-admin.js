// Crea el usuario administrador del ambiente LOCAL de pruebas
// (docker-compose.local.yml). Se niega a correr en cualquier otro lado:
// exige LOCAL_SEED_ALLOWED=true (solo lo define el compose local) y que
// MONGO_URI apunte al contenedor local — así nunca escribe en producción.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

(async () => {
  const uri = process.env.MONGO_URI || '';
  if (process.env.LOCAL_SEED_ALLOWED !== 'true' || !uri.includes('assets-manager-local')) {
    console.error('Este script solo corre en el Docker local (docker-compose.local.yml).');
    process.exit(1);
  }
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  if (!password || password.length < 6) {
    console.error('Falta LOCAL_ADMIN_PASSWORD (mínimo 6 caracteres) en .env.local');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const email = 'sistemas.2@selectshop.com.mx';
  const flags = Object.keys(User.schema.paths).filter((p) => p.startsWith('can'));
  const data = {
    name: 'Admin Local', email, role: 'admin',
    password: await bcrypt.hash(password, 10),
    ...Object.fromEntries(flags.map((f) => [f, true])),
  };
  await User.findOneAndUpdate({ email }, data, { upsert: true });
  console.log(`Usuario local listo: ${email} (contraseña en .env.local) — permisos: ${flags.join(', ')}`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
