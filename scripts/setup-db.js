const { createClient } = require('@supabase/supabase-js');

async function setup() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    console.log('Setting up Supabase table...');

    const { error } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS nubycord_users (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                mutex TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                display_name TEXT,
                is_admin BOOLEAN DEFAULT FALSE,
                created_by TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `
    }).catch(() => ({ error: 'rpc_unavailable' }));

    if (error) {
        const { error: insertErr } = await supabase.from('nubycord_users').select('id').limit(1);
        if (insertErr && insertErr.code === '42P01') {
            console.error('Table does not exist and cannot be created via RPC.');
            console.error('Please run this SQL in your Supabase dashboard (SQL Editor):');
            console.error(`
CREATE TABLE IF NOT EXISTS nubycord_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mutex TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
            `);
            process.exit(1);
        } else {
            console.log('Table already exists or was created.');
        }
    } else {
        console.log('Table ready.');
    }
}

if (require.main === module) {
    setup().catch(console.error);
}

module.exports = setup;
