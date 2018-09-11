const MemoryStorage = require('simple-memory-storage');

const db = new MemoryStorage();

//pre-store an user for the example
db.set('hkk', {
    'username': 'hkk',
    'password': 'hkk',
    'firstName': 'Hengxin',
    'lastName': 'Zhang',
    'hobbies': [ 'coding', 'reading' ]
});

/**
 * we don't use real database in this example
 */
module.exports = db;

