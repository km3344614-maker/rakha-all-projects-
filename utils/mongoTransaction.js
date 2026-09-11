const mongoose = require('mongoose');

const isRetryable = (error) => (
  error?.hasErrorLabel?.('TransientTransactionError')
  || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
  || error?.code === 112
);

const withMongoTransaction = async (work, options = {}) => {
  const attempts = Math.min(5, Math.max(1, Number(options.attempts) || 3));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 30));
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
};

const assertTransactionSupport = async () => {
  const admin = mongoose.connection.db.admin();
  const info = await admin.command({ hello: 1 });
  if (!info.setName && info.msg !== 'isdbgrid') {
    throw new Error('MongoDB transactions require Atlas, a replica set, or a sharded cluster');
  }
};

module.exports = { withMongoTransaction, assertTransactionSupport };
