const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { resolvePublicAppUrl } = require('./publicUrl');
const { sdkSslPins } = require('./security');

const CPP_ROOT = path.join(__dirname, '..', 'sdk', 'cpp');

const hiddenBytes = (name, value, seed) => {
  const bytes = Buffer.from(String(value ?? ''), 'utf8');
  let state = seed >>> 0;
  const encoded = Array.from(bytes, (byte) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return byte ^ (state & 0xff);
  }).reverse();
  const data = encoded.length ? encoded.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ') : '0';
  return [
    `inline constexpr uint32_t ${name}_seed = 0x${(seed >>> 0).toString(16)}u;`,
    `inline constexpr uint8_t ${name}_data[] = { ${data} };`,
    `inline constexpr size_t ${name}_size = ${bytes.length};`,
  ].join('\n');
};

const buildBoundHeaders = (app, origin, version) => {
  const values = {
    appId: String(app.appId || ''),
    appSecret: String(app.appSecret || ''),
    server: String(origin),
    version: String(version),
    sslPin: sdkSslPins().join(','),
  };
  const seedBase = Math.floor(Math.random() * 0xffffffff) >>> 0;

  const appConfigH = [
    '#pragma once',
    '#include <windows.h>',
    '#include <cstddef>',
    '#include <cstdint>',
    '#include <utility>',
    'namespace rakha_config {',
    hiddenBytes('app_id', values.appId, seedBase ^ 0x13a5c7e9),
    hiddenBytes('app_secret', values.appSecret, seedBase ^ 0x9e3779b9),
    hiddenBytes('server', values.server, seedBase ^ 0x7f4a7c15),
    hiddenBytes('version', values.version, seedBase ^ 0x6c8e9cf5),
    hiddenBytes('ssl_pin', values.sslPin, seedBase ^ 0xa5a5a5a5),
    'template <typename Fn>',
    'inline void with_hidden(const uint8_t* encoded, size_t size, uint32_t seed, Fn&& fn) {',
    '    if (!encoded || !size) { fn(nullptr, 0); return; }',
    '    uint8_t* plain = static_cast<uint8_t*>(VirtualAlloc(nullptr, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE));',
    '    if (!plain) { fn(nullptr, 0); return; }',
    '    VirtualLock(plain, size);',
    '    uint32_t state = seed;',
    '    for (size_t i = 0; i < size; ++i) {',
    '        state = state * 1664525u + 1013904223u;',
    '        plain[i] = encoded[size - 1 - i] ^ static_cast<uint8_t>(state & 0xffu);',
    '    }',
    '    fn(static_cast<const uint8_t*>(plain), size);',
    '    SecureZeroMemory(plain, size);',
    '    VirtualUnlock(plain, size);',
    '    VirtualFree(plain, 0, MEM_RELEASE);',
    '}',
    '#define RAKHA_CONFIG_ACCESSOR(fn, key) \\',
    'template <typename Fn> inline void fn(Fn&& cb) { \\',
    '    with_hidden(key##_data, key##_size, key##_seed, std::forward<Fn>(cb)); \\',
    '}',
    'RAKHA_CONFIG_ACCESSOR(with_app_id, app_id)',
    'RAKHA_CONFIG_ACCESSOR(with_app_secret, app_secret)',
    'RAKHA_CONFIG_ACCESSOR(with_server, server)',
    'RAKHA_CONFIG_ACCESSOR(with_version, version)',
    'RAKHA_CONFIG_ACCESSOR(with_ssl_pin, ssl_pin)',
    '#undef RAKHA_CONFIG_ACCESSOR',
    '}',
    '',
  ].join('\n');

  const rakhaAuthH = [
    '#pragma once',
    '#include "app_config.h"',
    '#include "RakhaAuth.hpp"',
    '#include <cstdint>',
    '#include <mutex>',
    '#include <string>',
    '#include <vector>',
    'namespace rakhaauth {',
    'inline const char* application_title() { return "Application"; }',
    'enum class Mode { Socket = 0, Http = 1 };',
    'enum class ErrorDisplay { Silent, Console, Popup, PopupCopyDetails };',
    'inline std::mutex& mutex_ref() { static std::mutex m; return m; }',
    'inline RakhaAuth*& client_ref() { static RakhaAuth* c = nullptr; return c; }',
    'inline bool& ready_ref() { static bool r = false; return r; }',
    'inline std::string& last_error_ref() { static std::string e; return e; }',
    'inline ErrorDisplay& display_ref() { static ErrorDisplay d = ErrorDisplay::Silent; return d; }',
    'inline void set_error_display(ErrorDisplay d) { display_ref() = d; }',
    'inline void show_error(const std::string& msg) {',
    '    last_error_ref() = msg;',
    '    if (display_ref() == ErrorDisplay::Silent) return;',
    '#ifdef _WIN32',
    '    if (display_ref() == ErrorDisplay::Popup || display_ref() == ErrorDisplay::PopupCopyDetails)',
    '        MessageBoxA(nullptr, msg.c_str(), application_title(), MB_OK | MB_ICONERROR);',
    '#endif',
    '}',
    'inline std::string last_error() { return last_error_ref(); }',
    'inline RakhaAuth* make_bound_client(const std::string& requested_version) {',
    '    std::string version = requested_version;',
    '    if (version.empty()) rakha_config::with_version([&](const uint8_t* p, size_t n) { if (p && n) version.assign(reinterpret_cast<const char*>(p), n); });',
    '    auto* client = new RakhaAuth("", "", "", version, true, true, "");',
    '    rakha_config::with_app_id([&](const uint8_t* p, size_t n) { client->ingestKid(p, n); });',
    '    rakha_config::with_app_secret([&](const uint8_t* p, size_t n) { client->ingestSecret(p, n); });',
    '    rakha_config::with_server([&](const uint8_t* p, size_t n) { client->ingestServer(p, n); });',
    '    rakha_config::with_ssl_pin([&](const uint8_t* p, size_t n) { client->ingestPin(p, n); });',
    '    return client;',
    '}',
    'inline bool init(const std::string& version = "", Mode = Mode::Socket) {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    ready_ref() = false;',
    '    last_error_ref().clear();',
    '    delete client_ref();',
    '    client_ref() = make_bound_client(version);',
    '    auto info = client_ref()->init();',
    '    if (!info.success) {',
    '        show_error(info.message.empty() ? XOR("init failed") : info.message);',
    '        delete client_ref();',
    '        client_ref() = nullptr;',
    '        return false;',
    '    }',
    '    ready_ref() = true;',
    '    return true;',
    '}',
    'inline bool ensure_ready() {',
    '    if (ready_ref() && client_ref()) return true;',
    '    return init();',
    '}',
    'inline bool license(const std::string& key, const std::string& = "") {',
    '    if (!ensure_ready()) return false;',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) { show_error(XOR("init failed")); return false; }',
    '    auto res = client_ref()->loginWithKey(key);',
    '    if (!res.success) {',
    '        show_error(res.message.empty() ? XOR("license failed") : res.message);',
    '        return false;',
    '    }',
    '    client_ref()->startHeartbeat(45, [] { ExitProcess(0); });',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline bool login(const std::string& user, const std::string& pass) {',
    '    if (!ensure_ready()) return false;',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) { show_error(XOR("init failed")); return false; }',
    '    auto res = client_ref()->login(user, pass);',
    '    if (!res.success) {',
    '        show_error(res.message.empty() ? XOR("login failed") : res.message);',
    '        return false;',
    '    }',
    '    client_ref()->startHeartbeat(45, [] { ExitProcess(0); });',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline bool is_authenticated() { return ready_ref() && client_ref() && client_ref()->isLoggedIn(); }',
    'inline std::string username() { return client_ref() ? client_ref()->getUsername() : std::string(); }',
    'inline std::vector<RakhaAuth::RemoteFile> list_files() {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) return {};',
    '    return client_ref()->listFiles();',
    '}',
    'inline bool download_file(const std::string& name, std::vector<uint8_t>& out) {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) { show_error(XOR("not authenticated")); return false; }',
    '    if (!client_ref()->downloadFile(name, out)) {',
    '        show_error(XOR("download failed"));',
    '        return false;',
    '    }',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline bool download_file(const std::string& name, std::vector<uint8_t>& out,',
    '                          RakhaAuth::FileGrant& grant) {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) { show_error(XOR("not authenticated")); return false; }',
    '    if (!client_ref()->downloadFile(name, out, grant)) {',
    '        show_error(XOR("download failed"));',
    '        return false;',
    '    }',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline bool get_file_link(const std::string& name, RakhaAuth::FileGrant& grant) {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref()) { show_error(XOR("not authenticated")); return false; }',
    '    if (!client_ref()->getFileLink(name, grant)) {',
    '        show_error(XOR("no link"));',
    '        return false;',
    '    }',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline bool rebind_hwid() {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (!client_ref() || !client_ref()->isLoggedIn()) { show_error(XOR("not authenticated")); return false; }',
    '    auto res = client_ref()->rebindHwid();',
    '    if (!res.success) { show_error(res.message.empty() ? XOR("device bind failed") : res.message); return false; }',
    '    last_error_ref().clear();',
    '    return true;',
    '}',
    'inline void close() {',
    '    std::lock_guard<std::mutex> lock(mutex_ref());',
    '    if (client_ref()) {',
    '        client_ref()->stopHeartbeat();',
    '        delete client_ref();',
    '        client_ref() = nullptr;',
    '    }',
    '    ready_ref() = false;',
    '}',
    '}',
    '',
  ].join('\n');

  const quickStart = [
    '#include "rakhaauth.h"',
    '',
    '#include <iostream>',
    '#include <string>',
    '',
    'int main() {',
    '    std::string license_key;',
    '    std::cout << "License key: ";',
    '    std::getline(std::cin, license_key);',
    '',
    '    if (!rakhaauth::license(license_key)) {',
    '        std::cerr << rakhaauth::last_error() << "\\n";',
    '        return 1;',
    '    }',
    '',
    '    for (const auto& f : rakhaauth::list_files()) {',
    '        RakhaAuth::FileGrant grant;',
    '        if (rakhaauth::get_file_link(f.name, grant)) {',
    '            std::cout << f.name << " -> " << grant.url;',
    '            if (!grant.password.empty()) std::cout << " (password received)";',
    '            std::cout << "\\n";',
    '        }',
    '    }',
    '',
    '    rakhaauth::close();',
    '    return 0;',
    '}',
    '',
  ].join('\n');

  return { appConfigH, rakhaAuthH, quickStart };
};

const requireFile = (zip, zipPath, diskPath) => {
  if (!fs.existsSync(diskPath)) {
    throw new Error(`Missing SDK file: ${path.basename(diskPath)}`);
  }
  zip.file(zipPath, fs.readFileSync(diskPath));
};

const buildSdkZip = async (app, { baseUrl } = {}) => {
  if (!app.appId || !app.appSecret) {
    throw new Error('Application is missing appId/appSecret');
  }

  const origin = resolvePublicAppUrl(baseUrl);
  const version = app.version || '1.0.0';
  const bound = buildBoundHeaders(app, origin, version);
  const zip = new JSZip();

  zip.file('include/app_config.h', bound.appConfigH);
  zip.file('include/rakhaauth.h', bound.rakhaAuthH);
  requireFile(zip, 'include/skStr.h', path.join(CPP_ROOT, 'skStr.h'));
  requireFile(zip, 'include/VMProtectSDK.h', path.join(CPP_ROOT, 'VMProtectSDK.h'));
  requireFile(zip, 'include/protect_markers.h', path.join(CPP_ROOT, 'protect_markers.h'));
  requireFile(zip, 'include/RakhaAuth.hpp', path.join(CPP_ROOT, 'RakhaAuth.hpp'));
  requireFile(zip, 'include/hwid_collect.h', path.join(CPP_ROOT, 'hwid_collect.h'));
  requireFile(zip, 'include/trusted_time.h', path.join(CPP_ROOT, 'trusted_time.h'));
  requireFile(zip, 'include/doh.h', path.join(CPP_ROOT, 'doh.h'));
  zip.file('examples/quick_start.cpp', bound.quickStart);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  return {
    buffer,
    filename: 'RakhaAuth-SDK.zip',
  };
};

module.exports = {
  buildSdkZip,
};
