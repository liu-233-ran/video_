// 密码保护功能 - 已移除，保留空壳函数避免报错

function isPasswordProtected() {
    return false;
}

function isPasswordRequired() {
    return false;
}

function ensurePasswordProtection() {
    return true;
}

function isPasswordVerified() {
    return true;
}

async function verifyPassword(password) {
    return true;
}

function showPasswordModal() {}

function hidePasswordModal() {}

async function handlePasswordSubmit() {}

function initPasswordProtection() {}

window.isPasswordProtected = isPasswordProtected;
window.isPasswordRequired = isPasswordRequired;
window.isPasswordVerified = isPasswordVerified;
window.verifyPassword = verifyPassword;
window.ensurePasswordProtection = ensurePasswordProtection;
