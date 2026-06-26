const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const SALT_ROUNDS = 12;

function generateMutex() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = (len) => {
        const bytes = crypto.randomBytes(len * 2);
        let out = '';
        for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
        return out;
    };
    // Format: XXXXXX-XXXXXXX-XXXXXX-XXXXXXX-XXXXXX = 36 chars total
    return `${seg(6)}-${seg(7)}-${seg(6)}-${seg(7)}-${seg(6)}`;
}

async function ensureTable() {
    await supabase.from('nubycord_users').select('id').limit(1);
}

async function createUser(mutex, createdByAdmin) {
    const { data, error } = await supabase
        .from('nubycord_users')
        .insert([{
            mutex,
            password_hash: null,
            is_admin: false,
            created_by: createdByAdmin || 'system',
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

async function setDisplayName(mutex, displayName) {
    const { data, error } = await supabase
        .from('nubycord_users')
        .update({ display_name: displayName })
        .eq('mutex', mutex)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

async function getDisplayName(mutex) {
    const { data } = await supabase
        .from('nubycord_users')
        .select('display_name')
        .eq('mutex', mutex)
        .single();

    return data?.display_name || null;
}

async function createAdmin(mutex, password) {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { data, error } = await supabase
        .from('nubycord_users')
        .insert([{
            mutex,
            password_hash: hash,
            is_admin: true,
            created_by: 'bootstrap',
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

async function getUserByMutex(mutex) {
    const { data, error } = await supabase
        .from('nubycord_users')
        .select('*')
        .eq('mutex', mutex.trim())
        .single();

    if (error) {
        if (error.code !== 'PGRST116') {
            console.error('[Supabase] getUserByMutex error:', error.code, error.message, error.details);
        }
        return null;
    }
    return data;
}

async function setPassword(mutex, password) {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { data, error } = await supabase
        .from('nubycord_users')
        .update({ password_hash: hash })
        .eq('mutex', mutex)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

async function verifyPassword(hash, password) {
    return bcrypt.compare(password, hash);
}

async function listUsers() {
    const { data, error } = await supabase
        .from('nubycord_users')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
}

async function deleteUser(mutex) {
    const { error } = await supabase
        .from('nubycord_users')
        .delete()
        .eq('mutex', mutex);

    if (error) throw new Error(error.message);
}

async function adminExists() {
    const { data } = await supabase
        .from('nubycord_users')
        .select('id')
        .eq('is_admin', true)
        .limit(1);

    return data && data.length > 0;
}

module.exports = {
    supabase,
    generateMutex,
    createUser,
    createAdmin,
    getUserByMutex,
    setPassword,
    setDisplayName,
    getDisplayName,
    verifyPassword,
    listUsers,
    deleteUser,
    adminExists
};
