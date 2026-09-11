require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { seedAdmin } = require('../utils/seedAdmin');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await seedAdmin();
    console.log('Seed done');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
})();
