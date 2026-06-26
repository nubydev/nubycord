const Auth = require('./auth');

const password = process.argv[2];

if (!password) {
    console.error('Usage: node bootstrap-admin.js <password>');
    process.exit(1);
}

(async () => {
    try {
        const existing = await Auth.adminExists();
        if (existing) {
            console.log('An admin already exists. Aborting.');
            process.exit(0);
        }

        const mutex = Auth.generateMutex();
        await Auth.createAdmin(mutex, password);

        console.log('\n✓ Admin created successfully!\n');
        console.log('  Mutex (your login key):', mutex);
        console.log('  Password:              ', password);
        console.log('\nSave your mutex — you will need it to log in.\n');
    } catch (err) {
        console.error('Failed to create admin:', err.message);
        process.exit(1);
    }
})();
