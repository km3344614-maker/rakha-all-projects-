#pragma once
#ifndef RAKHA_AUTH_HPP
#define RAKHA_AUTH_HPP

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif
#ifndef WINVER
#define WINVER 0x0601
#endif
#ifndef NTDDI_VERSION
#define NTDDI_VERSION 0x06010000
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winhttp.h>
#include <tlhelp32.h>
#include <winternl.h>
#include <intrin.h>
#include <string>
#include <map>
#include <vector>
#include <sstream>
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>
#include <type_traits>
#include <chrono>
#include <iomanip>
#include <algorithm>
#include <fstream>
#include <cctype>
#include <cwctype>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")
#ifndef SECURITY_FLAG_IGNORE_REVOCATION
#define SECURITY_FLAG_IGNORE_REVOCATION 0x00000080
#endif
#include <bcrypt.h>
#include <wincrypt.h>
#ifndef CRYPTPROTECTMEMORY_SAME_PROCESS
#define CRYPTPROTECTMEMORY_SAME_PROCESS 0x00
#endif

#include "skStr.h"
#include "VMProtectSDK.h"
#include "protect_markers.h"
#include "hwid_collect.h"
#include "trusted_time.h"
#ifndef SXOR
#define SXOR(s) XOR(s)
#endif

namespace RakhaInternal {

#ifndef WINHTTP_OPTION_SNI_HOSTNAME
#define WINHTTP_OPTION_SNI_HOSTNAME 169
#endif

    inline std::string jsonGetString(const std::string& json, const std::string& key) {
        std::string search = "\"" + key + "\":\"";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return "";
        pos += search.size();
        size_t end = pos;
        while (end < json.size()) {
            if (json[end] == '\\') { end += 2; continue; }
            if (json[end] == '"')  break;
            end++;
        }
        if (end >= json.size()) return "";
        std::string val = json.substr(pos, end - pos);
        std::string result;
        for (size_t i = 0; i < val.size(); i++) {
            if (val[i] == '\\' && i + 1 < val.size()) {
                switch (val[i + 1]) {
                    case 'n':  result += '\n'; i++; break;
                    case 't':  result += '\t'; i++; break;
                    case '"':  result += '"';  i++; break;
                    case '\\': result += '\\'; i++; break;
                    default:   result += val[i];   break;
                }
            } else result += val[i];
        }
        return result;
    }

    inline bool jsonGetBool(const std::string& json, const std::string& key) {
        std::string search = "\"" + key + "\":";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return false;
        pos += search.size();
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        return json.compare(pos, 4, XOR("true").c_str()) == 0;
    }

    inline int jsonGetInt(const std::string& json, const std::string& key) {
        std::string search = "\"" + key + "\":";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return 0;
        pos += search.size();
        while (pos < json.size() && json[pos] == ' ') pos++;
        if (pos >= json.size()) return 0;
        bool neg = (json[pos] == '-');
        if (neg) pos++;
        size_t end = pos;
        while (end < json.size() && isdigit((unsigned char)json[end])) end++;
        if (end == pos) return 0;
        int val = std::stoi(json.substr(pos, end - pos));
        return neg ? -val : val;
    }

    inline long long jsonGetInt64(const std::string& json, const std::string& key) {
        std::string search = "\"" + key + "\":";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return 0;
        pos += search.size();
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        if (pos >= json.size()) return 0;
        bool neg = (json[pos] == '-');
        if (neg) pos++;
        size_t end = pos;
        while (end < json.size() && isdigit((unsigned char)json[end])) end++;
        if (end == pos) return 0;
        try {
            long long val = std::stoll(json.substr(pos, end - pos));
            return neg ? -val : val;
        } catch (...) { return 0; }
    }

    // [SECURITY FIX] مقارنة ثابتة الوقت لا تسرّب الطول عبر الخروج المبكر
    // XOR الطول يُدمج في النتيجة بدلاً من إرجاع false فوراً
    inline bool ctEq(const std::string& a, const std::string& b) {
        const size_t aLen = a.size();
        const size_t bLen = b.size();
        volatile unsigned char d = static_cast<unsigned char>(aLen ^ bLen);
        const size_t maxLen = (aLen > bLen) ? aLen : bLen;
        for (size_t i = 0; i < maxLen; i++) {
            unsigned char ai = (i < aLen) ? (unsigned char)a[i] : 0;
            unsigned char bi = (i < bLen) ? (unsigned char)b[i] : 0;
            d |= ai ^ bi;
        }
        return d == 0;
    }

    inline void secureWipe(void* p, size_t n) {
        if (p && n) SecureZeroMemory(p, n);
    }

    // [SECURITY FIX] مسح آمن للسلاسل النصية — إزالة assign() الزائدة
    // التي قد يحسّنها المُحسّن ويتجاوز SecureZeroMemory
    inline void secureWipeString(std::string& s) {
        if (!s.empty()) {
            SecureZeroMemory(&s[0], s.size());
        }
        s.clear();
        s.shrink_to_fit();
    }

    // Returns each element of an array of objects as raw JSON, so the existing
    // scalar getters can be reused on the elements.
    inline std::vector<std::string> jsonGetObjectArray(
        const std::string& json, const std::string& key)
    {
        std::vector<std::string> out;
        // [SECURITY FIX] حدود لمنع DoS عبر JSON متداخل أو ضخم
        constexpr int kMaxDepth = 32;
        constexpr size_t kMaxElements = 1024;
        std::string search = "\"" + key + "\":[";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return out;
        pos += search.size();

        while (pos < json.size() && out.size() < kMaxElements) {
            while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',' ||
                                         json[pos] == '\n' || json[pos] == '\r' ||
                                         json[pos] == '\t')) {
                pos++;
            }
            if (pos >= json.size() || json[pos] == ']') break;
            if (json[pos] != '{') break;

            size_t start = pos;
            int depth = 0;
            bool inStr = false;
            bool depthOverflow = false;
            while (pos < json.size()) {
                const char c = json[pos];
                if (inStr) {
                    if (c == '\\') pos++;
                    else if (c == '"') inStr = false;
                } else if (c == '"') {
                    inStr = true;
                } else if (c == '{') {
                    depth++;
                    if (depth > kMaxDepth) { depthOverflow = true; break; }
                } else if (c == '}') {
                    depth--;
                    if (depth == 0) { pos++; break; }
                }
                pos++;
            }
            if (depthOverflow || depth != 0) break;
            out.push_back(json.substr(start, pos - start));
        }
        return out;
    }

    inline std::map<std::string, std::string> jsonGetObject(
        const std::string& json, const std::string& key)
    {
        std::map<std::string, std::string> out;
        // [SECURITY FIX] حد أقصى للعمق لمنع stack overflow
        constexpr int kMaxDepth = 32;
        constexpr size_t kMaxKeys = 256;
        std::string search = "\"" + key + "\":{";
        size_t pos = json.find(search);
        if (pos == std::string::npos) return out;
        pos += search.size();

        int depth = 1;
        size_t i = pos;
        while (i < json.size() && depth > 0) {
            if (json[i] == '{') {
                depth++;
                if (depth > kMaxDepth) return out;
            }
            else if (json[i] == '}') depth--;
            if (depth > 0) i++;
        }
        std::string obj = json.substr(pos, i - pos);
        size_t p = 0;
        while (p < obj.size() && out.size() < kMaxKeys) {
            if (obj[p] != '"') { p++; continue; }
            p++;
            size_t ke = obj.find('"', p);
            if (ke == std::string::npos) break;
            std::string k = obj.substr(p, ke - p);
            p = ke + 1;
            if (p < obj.size() && obj[p] == ':') p++;
            if (p < obj.size() && obj[p] == '"') {
                p++;
                size_t ve = p;
                while (ve < obj.size()) {
                    if (obj[ve] == '\\') { ve += 2; continue; }
                    if (obj[ve] == '"')  break;
                    ve++;
                }
                out[k] = obj.substr(p, ve - p);
                p = ve + 1;
            } else {
                size_t ve = p;
                while (ve < obj.size() && obj[ve] != ',' && obj[ve] != '}') ve++;
                out[k] = obj.substr(p, ve - p);
                p = ve;
            }
        }
        return out;
    }


    inline std::wstring toWide(const std::string& s) {
        if (s.empty()) return L"";

        int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
        if (len <= 0) return L"";
        std::wstring ws(static_cast<size_t>(len), 0);
        MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &ws[0], len);
        return ws;
    }

    inline std::string fromWide(const std::wstring& w) {
        if (w.empty()) return {};
        int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
        if (n <= 0) return {};
        std::string s(static_cast<size_t>(n), '\0');
        WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr);
        return s;
    }

    inline std::string queryCustomHeader(HINTERNET hReq, const wchar_t* name) {
        DWORD sz = 0;
        WinHttpQueryHeaders(hReq, WINHTTP_QUERY_CUSTOM, name, WINHTTP_NO_OUTPUT_BUFFER, &sz, WINHTTP_NO_HEADER_INDEX);
        if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || sz < sizeof(wchar_t)) return {};
        std::wstring w(sz / sizeof(wchar_t), L'\0');
        if (!WinHttpQueryHeaders(hReq, WINHTTP_QUERY_CUSTOM, name, &w[0], &sz, WINHTTP_NO_HEADER_INDEX)) return {};
        while (!w.empty() && w.back() == L'\0') w.pop_back();
        return fromWide(w);
    }

    inline std::string escapeJson(const std::string& s) {
        std::string out;
        out.reserve(s.size());
        for (unsigned char c : s) {
            if      (c == '"')  out += "\\\"";
            else if (c == '\\') out += "\\\\";
            else if (c == '\n') out += "\\n";
            else if (c == '\r') out += "\\r";
            else if (c == '\t') out += "\\t";
            else if (c < 0x20) {  }
            else                out += (char)c;
        }
        return out;
    }

    inline std::string toUpper(std::string s) {
        std::transform(s.begin(), s.end(), s.begin(), ::toupper);
        return s;
    }


    SHIELD_NOINLINE void sha256Raw(const uint8_t* data, size_t len, uint8_t out[32]) {
        static const uint32_t k[64] = {
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
        };
        auto rotr = [](uint32_t x, uint32_t n) { return (x >> n) | (x << (32 - n)); };
        auto ch = [](uint32_t x, uint32_t y, uint32_t z) { return (x & y) ^ (~x & z); };
        auto maj = [](uint32_t x, uint32_t y, uint32_t z) { return (x & y) ^ (x & z) ^ (y & z); };
        auto sig0 = [&](uint32_t x) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); };
        auto sig1 = [&](uint32_t x) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); };
        auto gam0 = [&](uint32_t x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3); };
        auto gam1 = [&](uint32_t x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10); };
        uint32_t h[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
        std::vector<uint8_t> p(data, data + len);
        uint64_t bit_len = (uint64_t)len * 8ULL;
        p.push_back(0x80);
        while ((p.size() + 8) % 64 != 0) p.push_back(0x00);
        for (int i = 7; i >= 0; i--) p.push_back((uint8_t)((bit_len >> (i * 8)) & 0xff));
        for (size_t off = 0; off < p.size(); off += 64) {
            const uint8_t* chunk = &p[off];
            uint32_t w[64];
            for (int i = 0; i < 16; i++)
                w[i] = (chunk[i*4] << 24) | (chunk[i*4+1] << 16) | (chunk[i*4+2] << 8) | chunk[i*4+3];
            for (int i = 16; i < 64; i++) w[i] = gam1(w[i-2]) + w[i-7] + gam0(w[i-15]) + w[i-16];
            uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], l = h[7];
            for (int i = 0; i < 64; i++) {
                uint32_t t1 = l + sig1(e) + ch(e, f, g) + k[i] + w[i];
                uint32_t t2 = sig0(a) + maj(a, b, c);
                l = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
            }
            h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += l;
        }
        for (int i = 0; i < 8; i++) {
            out[i*4]   = (uint8_t)(h[i] >> 24);
            out[i*4+1] = (uint8_t)(h[i] >> 16);
            out[i*4+2] = (uint8_t)(h[i] >> 8);
            out[i*4+3] = (uint8_t)(h[i]);
        }
        SecureZeroMemory(h, sizeof(h));
        if (!p.empty()) SecureZeroMemory(p.data(), p.size());
    }

    inline std::string toHex(const uint8_t* data, size_t len) {
        static const char* hexd = "0123456789abcdef";
        std::string s; s.resize(len * 2);
        for (size_t i = 0; i < len; i++) {
            s[i*2] = hexd[data[i] >> 4];
            s[i*2+1] = hexd[data[i] & 0xf];
        }
        return s;
    }


    SHIELD_NOINLINE void hmacSha256Raw(const uint8_t* key, size_t keyLen, const uint8_t* data, size_t dataLen, uint8_t out[32]) {
        uint8_t keyHash[32] = {};
        uint8_t kpad[64] = {};
        uint8_t ipad[64] = {};
        uint8_t opad[64] = {};
        if (keyLen > 64) {
            sha256Raw(key, keyLen, keyHash);
            memcpy(kpad, keyHash, 32);
        } else if (key && keyLen) {
            memcpy(kpad, key, keyLen);
        }
        memcpy(ipad, kpad, 64);
        memcpy(opad, kpad, 64);
        for (int i = 0; i < 64; i++) { ipad[i] ^= 0x36; opad[i] ^= 0x5c; }
        std::vector<uint8_t> inner(ipad, ipad + 64);
        if (data && dataLen) inner.insert(inner.end(), data, data + dataLen);
        uint8_t innerHash[32] = {};
        sha256Raw(inner.data(), inner.size(), innerHash);
        std::vector<uint8_t> outer(opad, opad + 64);
        outer.insert(outer.end(), innerHash, innerHash + 32);
        sha256Raw(outer.data(), outer.size(), out);
        secureWipe(keyHash, sizeof(keyHash));
        secureWipe(innerHash, sizeof(innerHash));
        secureWipe(kpad, sizeof(kpad));
        secureWipe(ipad, sizeof(ipad));
        secureWipe(opad, sizeof(opad));
        if (!inner.empty()) secureWipe(inner.data(), inner.size());
        if (!outer.empty()) secureWipe(outer.data(), outer.size());
    }

    SHIELD_NOINLINE std::string hmacSha256(const uint8_t* key, size_t keyLen, const uint8_t* data, size_t dataLen) {
        uint8_t out[32] = {};
        hmacSha256Raw(key, keyLen, data, dataLen, out);
        std::string hex = toHex(out, 32);
        secureWipe(out, sizeof(out));
        return hex;
    }

    inline std::string hmacSha256(const uint8_t* key, size_t keyLen, const std::string& data) {
        return hmacSha256(key, keyLen,
            reinterpret_cast<const uint8_t*>(data.data()), data.size());
    }

    inline std::string hmacSha256(const std::string& key, const std::string& data) {
        return hmacSha256(
            reinterpret_cast<const uint8_t*>(key.data()), key.size(),
            reinterpret_cast<const uint8_t*>(data.data()), data.size());
    }


    inline std::string sha256Hex(const std::vector<uint8_t>& data) {
        uint8_t out[32];
        sha256Raw(data.data(), data.size(), out);
        return toHex(out, 32);
    }

    inline std::string b64Encode(const uint8_t* data, size_t len) {
        DWORD need = 0;
        if (!CryptBinaryToStringA(data, (DWORD)len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &need))
            return "";
        std::string out(need, '\0');
        if (!CryptBinaryToStringA(data, (DWORD)len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &out[0], &need))
            return "";
        while (!out.empty() && (out.back() == '\0' || out.back() == '\n' || out.back() == '\r')) out.pop_back();
        return out;
    }

    inline std::string randomHex(size_t bytes) {
        if (bytes == 0 || bytes > 64) return {};
        uint8_t raw[64] = {};
        if (BCryptGenRandom(nullptr, raw, static_cast<ULONG>(bytes),
                BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
            SecureZeroMemory(raw, sizeof(raw));
            return {};
        }
        static constexpr char hex[] = "0123456789abcdef";
        std::string out(bytes * 2, '\0');
        for (size_t i = 0; i < bytes; ++i) {
            out[i * 2] = hex[raw[i] >> 4];
            out[i * 2 + 1] = hex[raw[i] & 0x0F];
        }
        SecureZeroMemory(raw, sizeof(raw));
        return out;
    }

    inline std::vector<uint8_t> b64Decode(const std::string& s, size_t maxChars = 2 * 1024 * 1024) {
        if (s.empty() || s.size() > maxChars || s.size() > static_cast<size_t>(MAXDWORD))
            return {};
        DWORD need = 0;
        if (!CryptStringToBinaryA(s.c_str(), (DWORD)s.size(), CRYPT_STRING_BASE64, nullptr, &need, nullptr, nullptr))
            return {};
        std::vector<uint8_t> out(need);
        if (!CryptStringToBinaryA(s.c_str(), (DWORD)s.size(), CRYPT_STRING_BASE64, out.data(), &need, nullptr, nullptr))
            return {};
        out.resize(need);
        return out;
    }

    SHIELD_NOINLINE void deriveAesKeyV1(const uint8_t* secret, size_t secretLen, uint8_t out[32]) {
        std::string prefix = VMP_STR("rakha-sdk-aes-v1|");
        std::vector<uint8_t> mat(prefix.size() + secretLen);
        memcpy(mat.data(), prefix.data(), prefix.size());
        if (secret && secretLen)
            memcpy(mat.data() + prefix.size(), secret, secretLen);
        if (!prefix.empty()) SecureZeroMemory(&prefix[0], prefix.size());
        prefix.clear();
        sha256Raw(mat.data(), mat.size(), out);
        secureWipe(mat.data(), mat.size());
    }

    SHIELD_NOINLINE void deriveAesKeyV2(const uint8_t* secret, size_t secretLen, uint8_t out[32]) {
        vmp::UltraScope protectionScope(VMP_STR("RakhaAuth.DeriveKeyV2"));
        std::string saltMaterial = VMP_STR("rakha-sdk-hkdf-salt-v2|");
        saltMaterial.append(reinterpret_cast<const char*>(secret), secretLen);
        uint8_t salt[32];
        sha256Raw(
            reinterpret_cast<const uint8_t*>(saltMaterial.data()),
            saltMaterial.size(),
            salt
        );
        SecureZeroMemory(&saltMaterial[0], saltMaterial.size());
        uint8_t prk[32];
        hmacSha256Raw(salt, 32, secret, secretLen, prk);
        std::string info = VMP_STR("rakha-sdk-aes-v2");
        uint8_t msg[19] = {};
        const size_t n = (info.size() < 18) ? info.size() : 18;
        memcpy(msg, info.data(), n);
        msg[18] = 1;
        if (!info.empty()) SecureZeroMemory(&info[0], info.size());
        hmacSha256Raw(prk, 32, msg, 19, out);
        SecureZeroMemory(prk, 32);
        SecureZeroMemory(msg, sizeof(msg));
        SecureZeroMemory(salt, sizeof(salt));
    }

    inline void deriveAesKey(const uint8_t* secret, size_t secretLen, uint8_t out[32], int version = 2) {
        if (version == 2) deriveAesKeyV2(secret, secretLen, out);
        else deriveAesKeyV1(secret, secretLen, out);
    }

    inline void deriveAesKey(const std::string& secret, uint8_t out[32], int version = 2) {
        deriveAesKey(reinterpret_cast<const uint8_t*>(secret.data()), secret.size(), out, version);
    }


    SHIELD_NOINLINE std::string aesGcmEncryptJson(const uint8_t* secret, size_t secretLen, const std::string& plaintext) {
        uint8_t key[32];
        deriveAesKey(secret, secretLen, key, 2);
        uint8_t iv[12];
        if (BCryptGenRandom(nullptr, iv, sizeof(iv), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
            SecureZeroMemory(key, sizeof(key));
            return "";
        }

        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_KEY_HANDLE hKey = nullptr;
        if (!NT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0))) {
            SecureZeroMemory(key, sizeof(key));
            return "";
        }
        if (!NT_SUCCESS(BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
            (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
            SecureZeroMemory(key, sizeof(key));
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        if (!NT_SUCCESS(BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, key, 32, 0))) {
            SecureZeroMemory(key, sizeof(key));
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        SecureZeroMemory(key, sizeof(key));

        uint8_t tag[16] = {};
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO auth;
        BCRYPT_INIT_AUTH_MODE_INFO(auth);
        auth.pbNonce = iv;
        auth.cbNonce = 12;
        auth.pbTag = tag;
        auth.cbTag = 16;

        ULONG cbResult = 0;
        std::vector<uint8_t> ct(plaintext.size());
        NTSTATUS st = BCryptEncrypt(hKey, (PUCHAR)plaintext.data(), (ULONG)plaintext.size(),
            &auth, nullptr, 0, ct.data(), (ULONG)ct.size(), &cbResult, 0);
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        if (!NT_SUCCESS(st)) return "";
        ct.resize(cbResult);

        std::string out = XOR("{\"enc\":2,\"iv\":\"") + b64Encode(iv, 12) +
            XOR("\",\"tag\":\"") + b64Encode(tag, 16) +
            XOR("\",\"data\":\"") + b64Encode(ct.data(), ct.size()) + XOR("\"}");
        if (!ct.empty()) SecureZeroMemory(ct.data(), ct.size());
        SecureZeroMemory(iv, sizeof(iv));
        SecureZeroMemory(tag, sizeof(tag));
        return out;
    }

    inline std::string aesGcmEncryptJson(const std::string& secret, const std::string& plaintext) {
        return aesGcmEncryptJson(reinterpret_cast<const uint8_t*>(secret.data()), secret.size(), plaintext);
    }

    SHIELD_NOINLINE std::string aesGcmDecryptEnvelope(const uint8_t* secret, size_t secretLen, const std::string& envelopeJson) {
        vmp::UltraScope protectionScope(VMP_STR("RakhaAuth.DecryptEnvelope"));
        std::string ivB = jsonGetString(envelopeJson, XOR("iv"));
        std::string tagB = jsonGetString(envelopeJson, XOR("tag"));
        std::string dataB = jsonGetString(envelopeJson, XOR("data"));
        if (ivB.empty() || tagB.empty() || dataB.empty()) return "";
        auto iv = b64Decode(ivB, 24);
        auto tag = b64Decode(tagB, 32);
        auto data = b64Decode(dataB, 2 * 1024 * 1024);
        if (iv.size() != 12 || tag.size() != 16 || data.empty()) return "";

        uint8_t key[32];
        int enc = jsonGetInt(envelopeJson, XOR("enc"));
        deriveAesKey(secret, secretLen, key, enc == 2 ? 2 : 1);

        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_KEY_HANDLE hKey = nullptr;
        if (!NT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0))) {
            SecureZeroMemory(key, sizeof(key));
            return "";
        }
        if (!NT_SUCCESS(BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
            (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
            SecureZeroMemory(key, sizeof(key));
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        if (!NT_SUCCESS(BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, key, 32, 0))) {
            SecureZeroMemory(key, sizeof(key));
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        SecureZeroMemory(key, sizeof(key));

        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO auth;
        BCRYPT_INIT_AUTH_MODE_INFO(auth);
        auth.pbNonce = iv.data();
        auth.cbNonce = 12;
        auth.pbTag = tag.data();
        auth.cbTag = 16;

        ULONG cbResult = 0;
        std::vector<uint8_t> pt(data.size());
        NTSTATUS st = BCryptDecrypt(hKey, data.data(), (ULONG)data.size(),
            &auth, nullptr, 0, pt.data(), (ULONG)pt.size(), &cbResult, 0);
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        if (!iv.empty()) SecureZeroMemory(iv.data(), iv.size());
        if (!data.empty()) SecureZeroMemory(data.data(), data.size());
        if (!NT_SUCCESS(st)) { return ""; }
        std::string result(reinterpret_cast<char*>(pt.data()), cbResult);
        if (!pt.empty()) SecureZeroMemory(pt.data(), pt.size());
        return result;
    }

    inline std::string aesGcmDecryptEnvelope(const std::string& secret, const std::string& envelopeJson) {
        return aesGcmDecryptEnvelope(reinterpret_cast<const uint8_t*>(secret.data()), secret.size(), envelopeJson);
    }

    SHIELD_NOINLINE std::string aesGcmEncryptRawKey(const uint8_t key[32], const std::string& plaintext) {
        uint8_t iv[12];
        if (BCryptGenRandom(nullptr, iv, sizeof(iv), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
            return "";
        }

        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_KEY_HANDLE hKey = nullptr;
        if (!NT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0))) {
            return "";
        }
        if (!NT_SUCCESS(BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
            (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        if (!NT_SUCCESS(BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, (PUCHAR)key, 32, 0))) {
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }

        uint8_t tag[16] = {};
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO auth;
        BCRYPT_INIT_AUTH_MODE_INFO(auth);
        auth.pbNonce = iv;
        auth.cbNonce = 12;
        auth.pbTag = tag;
        auth.cbTag = 16;

        ULONG cbResult = 0;
        std::vector<uint8_t> ct(plaintext.size());
        NTSTATUS st = BCryptEncrypt(hKey, (PUCHAR)plaintext.data(), (ULONG)plaintext.size(),
            &auth, nullptr, 0, ct.data(), (ULONG)ct.size(), &cbResult, 0);
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        if (!NT_SUCCESS(st)) return "";

        ct.resize(cbResult);
        std::string out = XOR("{\"enc\":3,\"iv\":\"") + b64Encode(iv, 12) +
            XOR("\",\"tag\":\"") + b64Encode(tag, 16) +
            XOR("\",\"data\":\"") + b64Encode(ct.data(), ct.size()) + XOR("\"}");
        if (!ct.empty()) SecureZeroMemory(ct.data(), ct.size());
        SecureZeroMemory(iv, sizeof(iv));
        SecureZeroMemory(tag, sizeof(tag));
        return out;
    }

    SHIELD_NOINLINE std::string aesGcmDecryptRawKey(const uint8_t key[32], const std::string& envelopeJson) {
        vmp::UltraScope protectionScope(VMP_STR("RakhaAuth.DecryptTransport"));
        if (jsonGetInt(envelopeJson, XOR("enc")) != 3) return "";
        std::string ivB = jsonGetString(envelopeJson, XOR("iv"));
        std::string tagB = jsonGetString(envelopeJson, XOR("tag"));
        std::string dataB = jsonGetString(envelopeJson, XOR("data"));
        if (ivB.empty() || tagB.empty() || dataB.empty()) return "";
        auto iv = b64Decode(ivB, 24);
        auto tag = b64Decode(tagB, 32);
        auto data = b64Decode(dataB, 2 * 1024 * 1024);
        if (iv.size() != 12 || tag.size() != 16 || data.empty()) return "";

        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_KEY_HANDLE hKey = nullptr;
        if (!NT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0))) {
            return "";
        }
        if (!NT_SUCCESS(BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE,
            (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }
        if (!NT_SUCCESS(BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, (PUCHAR)key, 32, 0))) {
            BCryptCloseAlgorithmProvider(hAlg, 0); return "";
        }

        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO auth;
        BCRYPT_INIT_AUTH_MODE_INFO(auth);
        auth.pbNonce = iv.data();
        auth.cbNonce = 12;
        auth.pbTag = tag.data();
        auth.cbTag = 16;

        ULONG cbResult = 0;
        std::vector<uint8_t> pt(data.size());
        NTSTATUS st = BCryptDecrypt(hKey, data.data(), (ULONG)data.size(),
            &auth, nullptr, 0, pt.data(), (ULONG)pt.size(), &cbResult, 0);
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        if (!iv.empty()) SecureZeroMemory(iv.data(), iv.size());
        if (!data.empty()) SecureZeroMemory(data.data(), data.size());
        if (!NT_SUCCESS(st)) return "";
        std::string result(reinterpret_cast<char*>(pt.data()), cbResult);
        if (!pt.empty()) SecureZeroMemory(pt.data(), pt.size());
        return result;
    }

    inline std::string withOp(int op, const std::string& obj) {
        std::string head = XOR("{\"op\":");
        head += std::to_string(op);
        if (obj.size() >= 2 && obj.front() == '{' && obj.back() == '}') {
            if (obj.size() == 2) {
                head += XOR("}");
                return head;
            }
            head += XOR(",");
            head += obj.substr(1);
            return head;
        }
        head += XOR("}");
        return head;
    }

    inline std::string unwrapSdkJson(const uint8_t* secret, size_t secretLen, const std::string& body) {
        if (body.find(XOR("\"enc\":").c_str()) != std::string::npos) {
            std::string pt = aesGcmDecryptEnvelope(secret, secretLen, body);
            return pt.empty() ? body : pt;
        }
        return body;
    }

    inline std::string unwrapSdkJson(const std::string& secret, const std::string& body) {
        return unwrapSdkJson(reinterpret_cast<const uint8_t*>(secret.data()), secret.size(), body);
    }


    inline std::string getSelfFileHash(bool forceRefresh = false) {
        static std::mutex cacheMutex;
        static std::string cached;
        static bool done = false;
        std::lock_guard<std::mutex> cacheLock(cacheMutex);
        if (!forceRefresh && done && !cached.empty()) return cached;

        std::string computed;
        auto finish = [&](const UCHAR hash[32], bool ok) {
            if (!ok) return;
            static const char* hex = "0123456789abcdef";
            computed.clear();
            computed.reserve(64);
            for (int i = 0; i < 32; i++) {
                computed.push_back(hex[(hash[i] >> 4) & 0xF]);
                computed.push_back(hex[hash[i] & 0xF]);
            }
        };

        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_HASH_HANDLE hHash = nullptr;
        if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0)
            return cached;
        if (BCryptCreateHash(hAlg, &hHash, nullptr, 0, nullptr, 0, 0) != 0) {
            BCryptCloseAlgorithmProvider(hAlg, 0);
            return cached;
        }

        bool ok = true;
        if (VMProtectIsProtected()) {
            HMODULE hMod = GetModuleHandleW(nullptr);
            auto* dos = (PIMAGE_DOS_HEADER)hMod;
            if (!hMod || dos->e_magic != IMAGE_DOS_SIGNATURE) {
                ok = false;
            } else {
                auto* nt = (PIMAGE_NT_HEADERS)((BYTE*)hMod + dos->e_lfanew);
                DWORD sz = nt->OptionalHeader.SizeOfHeaders;
                if (sz < 512) sz = 512;
                if (sz > 4096) sz = 4096;
                if (BCryptHashData(hHash, (PUCHAR)hMod, sz, 0) != 0) ok = false;
            }
        } else {
            wchar_t path[MAX_PATH] = {};
            if (!GetModuleFileNameW(nullptr, path, MAX_PATH)) ok = false;
            HANDLE hf = ok ? CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                nullptr, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, nullptr) : INVALID_HANDLE_VALUE;
            if (hf == INVALID_HANDLE_VALUE) ok = false;
            else {
                std::vector<uint8_t> chunk(1024 * 1024);
                DWORD read = 0;
                while (ReadFile(hf, chunk.data(), (DWORD)chunk.size(), &read, nullptr) && read > 0) {
                    if (BCryptHashData(hHash, chunk.data(), read, 0) != 0) { ok = false; break; }
                }
                CloseHandle(hf);
            }
        }

        UCHAR hash[32] = {};
        if (ok && BCryptFinishHash(hHash, hash, 32, 0) == 0) {
            finish(hash, true);
            cached = computed;
            done = !cached.empty();
        }
        SecureZeroMemory(hash, sizeof(hash));
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return computed.empty() ? cached : computed;
    }

    inline std::string getTimestamp() {
        const long long wall = unixNow();
        if (wall >= kMinUnixSane) return std::to_string(wall);
        return std::to_string(trustedUnixNow());
    }

    inline std::string toBase64(const std::string& in) {
        static const char* lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string out;
        int val = 0, valb = -6;
        for (unsigned char c : in) {
            val = (val << 8) + c;
            valb += 8;
            while (valb >= 0) {
                out.push_back(lookup[(val >> valb) & 0x3F]);
                valb -= 6;
            }
        }
        if (valb > -6) out.push_back(lookup[((val << 8) >> (valb + 8)) & 0x3F]);
        while (out.size() % 4) out.push_back('=');
        return out;
    }


    inline std::string fnv1a(const std::string& input) {
        unsigned int hash = 0x811c9dc5;
        for (unsigned char c : input) {
            hash ^= c;
            hash *= 0x01000193;
        }
        std::stringstream ss;
        ss << std::hex << std::setw(8) << std::setfill('0') << hash;
        return ss.str();
    }

    inline std::string getHWID() {
        vmp::UltraScope protectionScope(VMP_STR("RakhaAuth.HWID"));
        std::string rawData = HwidCollect::buildAuthFingerprint(false);
        if (rawData.empty()) return XOR("UNKNOWN_HWID");
        std::vector<uint8_t> rawVec(rawData.begin(), rawData.end());
        secureWipeString(rawData);
        std::string result = sha256Hex(rawVec);
        if (!rawVec.empty()) SecureZeroMemory(rawVec.data(), rawVec.size());
        return result;
    }

    // [SECURITY FIX] استخدام GetComputerNameA بدلاً من GetUserNameA
    // الدالة اسمها getComputerName لكنها كانت تُرجع اسم المستخدم!
    // GetComputerNameA يُرجع اسم الجهاز الفعلي المطلوب للتتبع
    inline std::string getComputerName() {
        char buf[MAX_COMPUTERNAME_LENGTH + 1] = {};
        DWORD n = (DWORD)sizeof(buf);
        if (GetComputerNameA(buf, &n) && n > 0) return std::string(buf, n);
        // fallback: اسم المستخدم إذا فشل اسم الكمبيوتر
        char ubuf[256] = {};
        DWORD un = (DWORD)sizeof(ubuf);
        if (GetUserNameA(ubuf, &un) && un > 1) return std::string(ubuf, un - 1);
        un = GetEnvironmentVariableA(XOR("COMPUTERNAME").c_str(), ubuf, (DWORD)sizeof(ubuf));
        if (un > 0 && un < sizeof(ubuf)) return std::string(ubuf, un);
        return {};
    }


    // Ciphertext-at-rest secret. Plaintext exists only on the call stack for the
    // duration of withPlain(); the member blob is re-keyed (re-encrypted) before
    // the callback runs so a dump of `this` never contains the HMAC key.
    struct SecureSecret {
        mutable std::mutex mu;
        uint8_t* blob = nullptr;
        size_t blobCap = 0;
        uint8_t stream[64] = {};
        size_t len = 0;
        bool locked = false;
        bool streamLocked = false;
        bool pagesSealed = false;

        SecureSecret() = default;
        SecureSecret(const SecureSecret&) = delete;
        SecureSecret& operator=(const SecureSecret&) = delete;

        static void mix(uint8_t* dst, const uint8_t* src, size_t n, const uint8_t st[64]) {
            skc::vault_mix(dst, src, n, st, 64);
        }

        static size_t pageRound(size_t n) {
            constexpr size_t kPage = 4096;
            if (n < 16) n = 16;
            return (n + kPage - 1) & ~(kPage - 1);
        }

        bool blobReady() const { return blob && blobCap >= 16; }

        void allocBlob(size_t cap) {
            freeBlob();
            blobCap = pageRound(cap);
            blob = static_cast<uint8_t*>(VirtualAlloc(nullptr, blobCap, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE));
            if (!blob) {
                blobCap = 0;
                return;
            }
            SecureZeroMemory(blob, blobCap);
        }

        void freeBlob() {
            if (!blob) {
                blobCap = 0;
                pagesSealed = false;
                return;
            }
            DWORD old = 0;
            if (pagesSealed)
                VirtualProtect(blob, blobCap, PAGE_READWRITE, &old);
            pagesSealed = false;
            SecureZeroMemory(blob, blobCap);
            VirtualUnlock(blob, blobCap);
            VirtualFree(blob, 0, MEM_RELEASE);
            blob = nullptr;
            blobCap = 0;
        }

        void fillStream() {
            if (BCryptGenRandom(nullptr, stream, sizeof(stream), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) {
                DWORD t = GetTickCount() ^ (DWORD)(uintptr_t)this;
                LARGE_INTEGER qpc = {};
                QueryPerformanceCounter(&qpc);
                for (size_t i = 0; i < sizeof(stream); i++)
                    stream[i] = (uint8_t)((t >> (i % 24)) ^ (uint8_t)(qpc.QuadPart >> (i % 56)) ^ (0xA5u + (uint8_t)i));
            }
        }

        void sealPages() {
            if (!blobReady() || pagesSealed) return;
            DWORD old = 0;
            if (VirtualProtect(blob, blobCap, PAGE_NOACCESS, &old))
                pagesSealed = true;
        }

        void unsealPages() {
            if (!blobReady() || !pagesSealed) return;
            DWORD old = 0;
            if (VirtualProtect(blob, blobCap, PAGE_READWRITE, &old))
                pagesSealed = false;
        }

        void lockStream() {
            streamLocked = CryptProtectMemory(stream, (DWORD)sizeof(stream), CRYPTPROTECTMEMORY_SAME_PROCESS) != FALSE;
        }

        bool unlockStream() {
            if (!streamLocked) return true;
            if (!CryptUnprotectMemory(stream, (DWORD)sizeof(stream), CRYPTPROTECTMEMORY_SAME_PROCESS))
                return false;
            streamLocked = false;
            return true;
        }

        void lockBlob() {
            if (!blobReady()) return;
            VirtualLock(blob, blobCap);
            locked = CryptProtectMemory(blob, (DWORD)blobCap, CRYPTPROTECTMEMORY_SAME_PROCESS) != FALSE;
            lockStream();
            sealPages();
        }

        bool unlockBlob() {
            if (!blobReady()) return false;
            unsealPages();
            if (!unlockStream()) return false;
            if (locked) {
                if (!CryptUnprotectMemory(blob, (DWORD)blobCap, CRYPTPROTECTMEMORY_SAME_PROCESS))
                    return false;
                locked = false;
            }
            return true;
        }

        void encryptPlainIntoBlob(const uint8_t* plain, size_t n) {
            unsealPages();
            if (streamLocked) unlockStream();
            SecureZeroMemory(stream, sizeof(stream));
            fillStream();
            mix(blob, plain, n, stream);
            if (blobCap > n)
                BCryptGenRandom(nullptr, blob + n, (ULONG)(blobCap - n), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
            lockBlob();
        }

        void wipeUnlocked() {
            unsealPages();
            if (streamLocked) {
                CryptUnprotectMemory(stream, (DWORD)sizeof(stream), CRYPTPROTECTMEMORY_SAME_PROCESS);
                streamLocked = false;
            }
            if (blobReady() && locked) {
                CryptUnprotectMemory(blob, (DWORD)blobCap, CRYPTPROTECTMEMORY_SAME_PROCESS);
                locked = false;
            }
            freeBlob();
            SecureZeroMemory(stream, sizeof(stream));
            len = 0;
            locked = false;
            pagesSealed = false;
        }

        void setBytes(const uint8_t* plain, size_t n) {
            std::lock_guard<std::mutex> g(mu);
            wipeUnlocked();
            len = n;
            allocBlob(n);
            if (!blobReady()) {
                len = 0;
                return;
            }
            fillStream();
            if (plain && n) mix(blob, plain, n, stream);
            if (blobCap > n)
                BCryptGenRandom(nullptr, blob + n, (ULONG)(blobCap - n), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
            lockBlob();
        }

        void setAndWipe(std::string& plain) {
            setBytes(reinterpret_cast<const uint8_t*>(plain.data()), plain.size());
            secureWipeString(plain);
        }

        void set(std::string plain) { setAndWipe(plain); }

        void wipe() {
            std::lock_guard<std::mutex> g(mu);
            wipeUnlocked();
        }

        ~SecureSecret() { wipe(); }

        bool ready() const {
            std::lock_guard<std::mutex> g(mu);
            return len > 0;
        }

        template <typename Fn>
        auto withPlain(Fn&& fn) {
            using R = std::invoke_result_t<Fn, const uint8_t*, size_t>;
            std::lock_guard<std::mutex> g(mu);
            uint8_t dummy = 0;
            auto fail = [&]() -> R { return fn(static_cast<const uint8_t*>(&dummy), size_t{0}); };
            if (!blobReady() || len == 0) return fail();
            if (vmp::compromised() || skc::debugger_present_fast()) return fail();

            CLEAR_START;

            // [SECURITY FIX] anti-timing: قياس الوقت قبل فك التشفير
            LARGE_INTEGER tStart, tEnd, tFreq;
            QueryPerformanceFrequency(&tFreq);
            QueryPerformanceCounter(&tStart);

            constexpr size_t kStack = 256;
            uint8_t stackBuf[kStack];
            SecureZeroMemory(stackBuf, sizeof(stackBuf));
            uint8_t* plain = stackBuf;
            bool heap = false;
            if (len > kStack) {
                plain = static_cast<uint8_t*>(VirtualAlloc(nullptr, len, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE));
                if (!plain) {
                    CLEAR_END;
                    return fail();
                }
                heap = true;
                VirtualLock(plain, len);
            } else {
                // [SECURITY FIX] VirtualLock للـ stack buffer أيضاً لمنع الترحيل
                VirtualLock(stackBuf, sizeof(stackBuf));
            }

            struct Guard {
                uint8_t* p;
                size_t n;
                bool heap;
                uint8_t* stackBase;
                size_t stackSize;
                ~Guard() {
                    if (p && n) SecureZeroMemory(p, n);
                    if (heap && p) {
                        VirtualUnlock(p, n);
                        VirtualFree(p, 0, MEM_RELEASE);
                    } else if (stackBase) {
                        VirtualUnlock(stackBase, stackSize);
                    }
                    p = nullptr;
                }
            } guard{ plain, len, heap, heap ? nullptr : stackBuf, heap ? 0 : sizeof(stackBuf) };

            if (!unlockBlob()) {
                CLEAR_END;
                return fail();
            }
            mix(plain, blob, len, stream);
            // Re-encrypt the member immediately so a dump of this object has no key.
            encryptPlainIntoBlob(plain, len);

            try {
                if constexpr (std::is_void_v<R>) {
                    fn(static_cast<const uint8_t*>(plain), len);
                    encryptPlainIntoBlob(plain, len);

                    // [SECURITY FIX] anti-timing: breakpoint يوقف التنفيذ > 500ms
                    QueryPerformanceCounter(&tEnd);
                    if ((tEnd.QuadPart - tStart.QuadPart) > tFreq.QuadPart / 2) {
                        wipeUnlocked();
                    }

                    CLEAR_END;
                    return;
                } else {
                    R result = fn(static_cast<const uint8_t*>(plain), len);
                    encryptPlainIntoBlob(plain, len);

                    // [SECURITY FIX] anti-timing: breakpoint يوقف التنفيذ > 500ms
                    QueryPerformanceCounter(&tEnd);
                    if ((tEnd.QuadPart - tStart.QuadPart) > tFreq.QuadPart / 2) {
                        wipeUnlocked();
                    }

                    CLEAR_END;
                    return result;
                }
            } catch (...) {
                encryptPlainIntoBlob(plain, len);
                CLEAR_END;
                throw;
            }
        }

        SHIELD_NOINLINE std::string hmacHex(const uint8_t* data, size_t dataLen) {
            return withPlain([&](const uint8_t* k, size_t n) {
                if (!k || n == 0) return std::string{};
                return hmacSha256(k, n, data, dataLen);
            });
        }

        SHIELD_NOINLINE std::string hmacHex(skc::re_encrypt_after_use& boxed) {
            return boxed.use([&](const char* p, size_t n) {
                if (!p || n == 0) return std::string{};
                return hmacHex(reinterpret_cast<const uint8_t*>(p), n);
            });
        }

        SHIELD_NOINLINE std::string hmacHex(const std::string& data) {
            skc::re_encrypt_after_use boxed;
            boxed.set(data.data(), data.size());
            return hmacHex(boxed);
        }

        template<typename... Parts>
        SHIELD_NOINLINE std::string hmacParts(Parts&&... parts) {
            skc::re_encrypt_after_use boxed;
            boxed.set_parts(std::forward<Parts>(parts)...);
            return hmacHex(boxed);
        }

        void exportLocked(skc::re_encrypt_after_use& dst) {
            withPlain([&](const uint8_t* k, size_t n) {
                dst.set(k, n);
            });
        }

        SHIELD_NOINLINE std::string copyEphemeral() {
            skc::re_encrypt_after_use boxed;
            exportLocked(boxed);
            return boxed.use([&](const char* p, size_t n) {
                return (p && n) ? std::string(p, n) : std::string{};
            });
        }

        SHIELD_NOINLINE std::string sealJson(const std::string& plainJson) {
            return withPlain([&](const uint8_t* k, size_t n) {
                return aesGcmEncryptJson(k, n, plainJson);
            });
        }

        SHIELD_NOINLINE std::string openJson(const std::string& wire) {
            return withPlain([&](const uint8_t* k, size_t n) {
                return unwrapSdkJson(k, n, wire);
            });
        }
    };

    inline SecureSecret& sslPinVault() {
        static SecureSecret pin;
        return pin;
    }

    inline void wipeHeaders(std::map<std::string, std::string>& hdrs) {
        for (auto& h : hdrs) {
            if (!h.second.empty()) {
                SecureZeroMemory(&h.second[0], h.second.size());
                h.second.clear();
            }
        }
        hdrs.clear();
    }

    inline void wipeWide(std::wstring& s) {
        if (!s.empty()) {
            SecureZeroMemory(&s[0], s.size() * sizeof(wchar_t));
            s.clear();
        }
    }

    struct HttpResult {
        int         status = 0;
        std::string body;
        std::string serverTime;
        std::string proof;
        bool        ok     = false;
    };


    struct HttpPool {
        std::mutex mu;
        HINTERNET session = nullptr;
        HINTERNET conn = nullptr;
        std::wstring host;
        INTERNET_PORT port = 0;
    };

    inline HttpPool& httpPool() {
        static HttpPool pool;
        return pool;
    }

    inline HINTERNET ensureSession() {
        auto& p = httpPool();
        if (!p.session) {
            p.session = WinHttpOpen(
                XOR(L"Auth SDK"),
                WINHTTP_ACCESS_TYPE_NO_PROXY,
                WINHTTP_NO_PROXY_NAME,
                WINHTTP_NO_PROXY_BYPASS, 0);
            if (p.session) {
                DWORD proto = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
#ifdef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3
                proto |= WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
#endif
                WinHttpSetOption(p.session, WINHTTP_OPTION_SECURE_PROTOCOLS, &proto, sizeof(proto));
                DWORD retries = 1;
                WinHttpSetOption(p.session, WINHTTP_OPTION_CONNECT_RETRIES, &retries, sizeof(retries));
            }
        }
        return p.session;
    }

    inline HINTERNET ensureConn(const std::wstring& host, INTERNET_PORT port) {
        auto& p = httpPool();
        if (p.conn && (p.host != host || p.port != port)) {
            WinHttpCloseHandle(p.conn);
            p.conn = nullptr;
        }
        if (!p.conn) {
            p.conn = WinHttpConnect(p.session, host.c_str(), port, 0);
            if (p.conn) {
                p.host = host;
                p.port = port;
            }
        }
        return p.conn;
    }

    inline void dropConn() {
        auto& p = httpPool();
        if (p.conn) {
            WinHttpCloseHandle(p.conn);
            p.conn = nullptr;
            p.host.clear();
            p.port = 0;
        }
    }

    inline void dropSession() {
        auto& p = httpPool();
        std::lock_guard<std::mutex> lk(p.mu);
        dropConn();
        if (p.session) {
            WinHttpCloseHandle(p.session);
            p.session = nullptr;
        }
    }


    // Accepts a comma-separated list so a renewed certificate can be trusted
    // before the old one is retired, without reshipping the client.
    inline bool certPinListMatches(const std::string& pinList, const std::string& got) {
        size_t start = 0;
        while (start <= pinList.size()) {
            size_t end = pinList.find(',', start);
            if (end == std::string::npos) end = pinList.size();
            std::string want;
            want.reserve(end - start);
            for (size_t i = start; i < end; i++) {
                const char c = pinList[i];
                if (c == ' ' || c == '\t' || c == '\r' || c == '\n') continue;
                want.push_back((char)tolower((unsigned char)c));
            }
            if (!want.empty() && want == got) return true;
            if (end == pinList.size()) break;
            start = end + 1;
        }
        return false;
    }

    inline bool verifyServerCertPin(HINTERNET hReq, const std::string& pinHex) {
        if (pinHex.empty()) return false;
        PCCERT_CONTEXT cert = nullptr;
        DWORD sz = sizeof(cert);
        if (!WinHttpQueryOption(hReq, WINHTTP_OPTION_SERVER_CERT_CONTEXT, &cert, &sz) || !cert) {
            return false;
        }
        BYTE hash[32] = {};
        DWORD hashLen = sizeof(hash);
        bool ok = false;
#ifndef CERT_SHA256_HASH_PROP_ID
#define CERT_SHA256_HASH_PROP_ID 107
#endif
        if (CertGetCertificateContextProperty(cert, CERT_SHA256_HASH_PROP_ID, hash, &hashLen)
            && hashLen == 32) {
            static const char* hex = "0123456789abcdef";
            std::string got;
            got.reserve(64);
            for (DWORD i = 0; i < hashLen; i++) {
                got.push_back(hex[(hash[i] >> 4) & 0xF]);
                got.push_back(hex[hash[i] & 0xF]);
            }
            ok = certPinListMatches(pinHex, got);
        }
        CertFreeCertificateContext(cert);
        return ok;
    }


    inline bool pinnedRequestOk(HINTERNET hReq, const std::string& sslPinHex) {
        if (!sslPinHex.empty())
            return verifyServerCertPin(hReq, sslPinHex);
        if (!sslPinVault().ready()) return false;
        return sslPinVault().withPlain([&](const uint8_t* p, size_t n) {
            if (!p || n == 0) return false;
            std::string pin(reinterpret_cast<const char*>(p), n);
            const bool ok = verifyServerCertPin(hReq, pin);
            secureWipeString(pin);
            return ok;
        });
    }

    inline HttpResult doRequest(
        const std::string& method,
        const std::string& baseUrl,
        const std::string& path,
        const std::string& body,
        std::map<std::string, std::string> hdrs,
        int timeoutMs = 8000,
        int retries   = 1,
        const std::string& sslPinHex = {},
        bool skipPin = false
    ) {
        HttpResult res;
        bool isHttps = (baseUrl.size() >= 5 && baseUrl.compare(0, 5, XOR("https").c_str()) == 0);
        std::string host = baseUrl;
        auto p = host.find(XOR("://").c_str());
        if (p != std::string::npos) host = host.substr(p + 3);
        if (!host.empty() && host.back() == '/') host.pop_back();


        INTERNET_PORT port = isHttps ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT;
        auto colon = host.rfind(':');
        if (colon != std::string::npos) {
            try { port = (INTERNET_PORT)std::stoi(host.substr(colon + 1)); }
            catch (...) {}
            host = host.substr(0, colon);
        }

        const std::wstring wideHost = toWide(host);
        int attemptsMax = retries;

        std::lock_guard<std::mutex> lk(httpPool().mu);
        for (int attempt = 0; attempt <= attemptsMax; attempt++) {
            const std::wstring wideConnect = wideHost;
            HINTERNET hSession = ensureSession();
            if (!hSession) continue;
            HINTERNET hConn = ensureConn(wideConnect, port);
            if (!hConn) continue;

            DWORD flags = isHttps ? WINHTTP_FLAG_SECURE : 0;
            HINTERNET hReq = WinHttpOpenRequest(
                hConn, toWide(method).c_str(), toWide(path).c_str(),
                nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
            if (!hReq) { dropConn(); continue; }

            for (auto& h : hdrs) {
                if (_stricmp(h.first.c_str(), XOR("User-Agent").c_str()) != 0 || h.second.empty()) continue;
                std::wstring ua = toWide(h.second);
                WinHttpSetOption(hReq, WINHTTP_OPTION_USER_AGENT, (LPVOID)ua.c_str(),
                    (DWORD)((ua.size() + 1) * sizeof(wchar_t)));
                break;
            }

            WinHttpSetTimeouts(hReq, timeoutMs, timeoutMs, timeoutMs, timeoutMs);
            if (isHttps) {
                DWORD secFlags = SECURITY_FLAG_IGNORE_REVOCATION;
                WinHttpSetOption(hReq, WINHTTP_OPTION_SECURITY_FLAGS, &secFlags, sizeof(secFlags));
            }

            std::wstring hStr;
            if (method != XOR("GET").c_str())
                hStr = XOR(L"Content-Type: application/json\r\n");
            for (auto& h : hdrs) {
                if (h.first.empty() || h.second.empty()) continue;
                hStr += toWide(h.first) + skc::live_copy(XOR(L": ")) + toWide(h.second) + skc::live_copy(XOR(L"\r\n"));
            }

            BOOL sent = WinHttpSendRequest(
                hReq,
                hStr.c_str(), (DWORD)hStr.length(),
                body.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)body.c_str(),
                (DWORD)body.size(), (DWORD)body.size(), 0);
            wipeWide(hStr);

            if (sent && WinHttpReceiveResponse(hReq, nullptr)) {
                if (isHttps && !skipPin && !pinnedRequestOk(hReq, sslPinHex)) {
                    WinHttpCloseHandle(hReq);
                    dropConn();
                    wipeHeaders(hdrs);
                    res.status = 0;
                    res.body = XOR("{\"success\":false,\"message\":\"SSL pin mismatch\"}");
                    return res;
                }

                DWORD sc = 0, scSz = sizeof(sc);
                WinHttpQueryHeaders(hReq,
                    WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                    WINHTTP_HEADER_NAME_BY_INDEX, &sc, &scSz, WINHTTP_NO_HEADER_INDEX);
                res.status = (int)sc;

                std::string rb;
                DWORD avail = 0;
                bool responseTooLarge = false;
                constexpr size_t kMaxResponseBytes = 4 * 1024 * 1024; // 4 MB
                while (WinHttpQueryDataAvailable(hReq, &avail) && avail > 0) {
                    if (rb.size() + avail > kMaxResponseBytes) {
                        responseTooLarge = true;
                        rb.clear();
                        break;
                    }
                    std::string chunk(avail, '\0');
                    DWORD read = 0;
                    if (!WinHttpReadData(hReq, &chunk[0], avail, &read)) {
                        rb.clear();
                        break;
                    }
                    rb.append(chunk, 0, read);
                }
                res.body = rb;
                res.ok   = !responseTooLarge && (sc >= 200 && sc < 300);
                if (responseTooLarge)
                    res.body = XOR("{\"success\":false,\"message\":\"Response too large\"}");
                res.serverTime = queryCustomHeader(hReq, XOR(L"x-rakha-time").c_str());
                res.proof = queryCustomHeader(hReq, XOR(L"x-rakha-proof").c_str());

                WinHttpCloseHandle(hReq);
                wipeHeaders(hdrs);
                return res;
            }
            WinHttpCloseHandle(hReq);
            dropConn();
            if (attempt < attemptsMax)
                std::this_thread::sleep_for(std::chrono::milliseconds(500 * (attempt + 1)));
        }
        wipeHeaders(hdrs);
        return res;
    }

    inline HttpResult httpPost(const std::string& url, const std::string& path,
        const std::string& body, std::map<std::string, std::string> hdrs,
        int timeoutMs = 8000, int retries = 0)
    {
        return doRequest(XOR("POST"), url, path, body, std::move(hdrs), timeoutMs, retries);
    }

    inline HttpResult httpGet(const std::string& url, const std::string& path,
        std::map<std::string, std::string> hdrs,
        int timeoutMs = 8000, int retries = 0)
    {
        return doRequest(XOR("GET"), url, path, {}, std::move(hdrs), timeoutMs, retries);
    }

    // GET against an absolute URL on a private WinHTTP session so a large
    // file download cannot block auth heartbeats or reuse a POST connection.
    // One-time ticket links must not be retried after the server answers.
    inline HttpResult httpGetUrl(const std::string& fullUrl, const std::string& pinHex,
        int timeoutMs = 30000)
    {
        HttpResult res;
        const size_t scheme = fullUrl.find(XOR("://").c_str());
        if (scheme == std::string::npos) return res;
        const size_t slash = fullUrl.find('/', scheme + 3);
        const std::string base = (slash == std::string::npos) ? fullUrl : fullUrl.substr(0, slash);
        std::string path = (slash == std::string::npos) ? std::string(XOR("/")) : fullUrl.substr(slash);
        const bool isHttps = (base.size() >= 5 && base.compare(0, 5, XOR("https").c_str()) == 0);

        std::string host = base;
        auto p = host.find(XOR("://").c_str());
        if (p != std::string::npos) host = host.substr(p + 3);
        if (!host.empty() && host.back() == '/') host.pop_back();
        INTERNET_PORT port = isHttps ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT;
        auto colon = host.rfind(':');
        if (colon != std::string::npos) {
            try { port = (INTERNET_PORT)std::stoi(host.substr(colon + 1)); }
            catch (...) {}
            host = host.substr(0, colon);
        }
        if (host.empty() || path.empty()) return res;

        HINTERNET ses = WinHttpOpen(XOR(L"Mozilla/5.0").c_str(), WINHTTP_ACCESS_TYPE_NO_PROXY,
            WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!ses) return res;
        DWORD proto = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
#ifdef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3
        proto |= WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
#endif
        WinHttpSetOption(ses, WINHTTP_OPTION_SECURE_PROTOCOLS, &proto, sizeof(proto));
        WinHttpSetTimeouts(ses, timeoutMs, timeoutMs, timeoutMs, timeoutMs);

        const std::wstring wideHost = toWide(host);
        HINTERNET con = WinHttpConnect(ses, wideHost.c_str(), port, 0);
        if (!con) { WinHttpCloseHandle(ses); return res; }

        DWORD flags = isHttps ? WINHTTP_FLAG_SECURE : 0;
        HINTERNET req = WinHttpOpenRequest(con, XOR(L"GET").c_str(), toWide(path).c_str(),
            nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!req) {
            WinHttpCloseHandle(con);
            WinHttpCloseHandle(ses);
            return res;
        }
        if (isHttps) {
            DWORD secFlags = SECURITY_FLAG_IGNORE_REVOCATION;
            WinHttpSetOption(req, WINHTTP_OPTION_SECURITY_FLAGS, &secFlags, sizeof(secFlags));
        }

        BOOL sent = WinHttpSendRequest(req, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
            WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
        if (sent && WinHttpReceiveResponse(req, nullptr)) {
            if (isHttps && !pinHex.empty() && !pinnedRequestOk(req, pinHex)) {
                WinHttpCloseHandle(req);
                WinHttpCloseHandle(con);
                WinHttpCloseHandle(ses);
                res.status = 0;
                res.body = XOR("{\"success\":false,\"message\":\"SSL pin mismatch\"}");
                return res;
            }
            DWORD sc = 0, scSz = sizeof(sc);
            WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX, &sc, &scSz, WINHTTP_NO_HEADER_INDEX);
            res.status = (int)sc;

            DWORD cl = 0, clSz = sizeof(cl);
            // [SECURITY FIX] حد أقصى لحجم التحميل لمنع استنزاف الذاكرة
            // سيرفر مُخترَق أو MITM يمكنه إرسال بيانات لا نهائية
            bool downloadTooLarge = false;
            constexpr size_t kMaxDownloadBytes = 512ULL * 1024 * 1024; // 512 MB
            if (WinHttpQueryHeaders(req, WINHTTP_QUERY_CONTENT_LENGTH | WINHTTP_QUERY_FLAG_NUMBER,
                    WINHTTP_HEADER_NAME_BY_INDEX, &cl, &clSz, WINHTTP_NO_HEADER_INDEX) && cl > 0) {
                if (static_cast<size_t>(cl) > kMaxDownloadBytes) {
                    downloadTooLarge = true;
                } else {
                    try { res.body.reserve(cl); }
                    catch (...) { downloadTooLarge = true; }
                }
            }
            for (; !downloadTooLarge;) {
                DWORD avail = 0;
                if (!WinHttpQueryDataAvailable(req, &avail)) break;
                if (avail == 0) break;
                if (res.body.size() + avail > kMaxDownloadBytes) {
                    downloadTooLarge = true;
                    res.body.clear();
                    break;
                }
                const size_t at = res.body.size();
                res.body.resize(at + avail);
                DWORD read = 0;
                if (!WinHttpReadData(req, &res.body[at], avail, &read) || !read) {
                    res.body.resize(at);
                    break;
                }
                res.body.resize(at + read);
            }
            res.ok = !downloadTooLarge && (sc >= 200 && sc < 300);
            res.serverTime = queryCustomHeader(req, XOR(L"x-rakha-time").c_str());
            res.proof = queryCustomHeader(req, XOR(L"x-rakha-proof").c_str());
        }
        WinHttpCloseHandle(req);
        WinHttpCloseHandle(con);
        WinHttpCloseHandle(ses);
        return res;
    }


    inline bool hostsTampered(const std::string& serverUrl) {
        char winDir[MAX_PATH] = {};
        GetWindowsDirectoryA(winDir, MAX_PATH);
        std::ifstream hostsFile(std::string(winDir) + std::string(XOR("\\System32\\drivers\\etc\\hosts")));
        if (!hostsFile.is_open()) return false;

        std::string host;

        size_t p = serverUrl.find(XOR("://"));
        if (p != std::string::npos) {
            size_t start = p + 3;
            size_t end = serverUrl.find_first_of(XOR(":/"), start);
            host = serverUrl.substr(start, end == std::string::npos ? std::string::npos : end - start);
        }
        for (char& c : host) c = (char)tolower((unsigned char)c);

        std::string line;
        while (std::getline(hostsFile, line)) {
            if (line.empty() || line[0] == '#') continue;
            std::string low = line;
            for (char& c : low) c = (char)tolower((unsigned char)c);
            if (!host.empty() && host != XOR("localhost").c_str() && host != XOR("127.0.0.1").c_str()
                && low.find(host) != std::string::npos) return true;
        }
        return false;
    }

    inline bool nameLooksHostile(const char* exe) {
        if (!exe || !exe[0]) return false;
#define HX(s) do { auto _t = XOR(s); if (_t.size() > 1 && !_stricmp(exe, _t.c_str())) return true; } while (0)
        HX("x64dbg.exe"); HX("x32dbg.exe"); HX("x96dbg.exe"); HX("ollydbg.exe"); HX("windbg.exe"); HX("windbgx.exe");
        HX("ida.exe"); HX("ida64.exe"); HX("idag.exe"); HX("idag64.exe"); HX("idaw.exe"); HX("idaw64.exe");
        HX("idaq.exe"); HX("idaq64.exe");
        HX("wireshark.exe"); HX("dumpcap.exe"); HX("tshark.exe");
        HX("fiddler.exe"); HX("fiddler everywhere.exe"); HX("proxifier.exe");
        HX("httpdebugger.exe"); HX("httpdebuggerui.exe"); HX("httpdebuggerproc.exe");
        HX("charles.exe"); HX("mitmproxy.exe"); HX("burpsuite.exe"); HX("burp.exe");
        HX("cheatengine-x86_64.exe"); HX("cheatengine-i386.exe"); HX("cheat engine.exe");
        HX("cheatengine.exe"); HX("ce.exe");
        HX("scylla_x64.exe"); HX("scylla_x86.exe"); HX("scylla.exe");
        HX("processhacker.exe"); HX("processhacker2.exe"); HX("systeminformer.exe");
        HX("dnspy.exe"); HX("dnspy-x86.exe"); HX("ilspy.exe"); HX("dotpeek.exe");
        HX("ghidra.exe"); HX("ghidrarun.exe"); HX("x64netdumper.exe"); HX("megadumper.exe");
        HX("extreme dumper.exe"); HX("pe-sieve.exe"); HX("hollows_hunter.exe");
        HX("reclass.exe"); HX("reclass.net.exe"); HX("shape.exe");
        HX("apimonitor.exe"); HX("apimonitor-x64.exe"); HX("apimonitor-x86.exe");
        HX("procmon.exe"); HX("procmon64.exe"); HX("procexp.exe"); HX("procexp64.exe");
        HX("die.exe"); HX("detect it easy.exe"); HX("pestudio.exe"); HX("lordpe.exe");
        HX("imprec.exe"); HX("importrec.exe"); HX("dumpcap.exe");
        HX("ksdumper.exe"); HX("ksdumperclient.exe"); HX("titanhide.exe");
        HX("keygen.exe"); HX("keymaker.exe"); HX("cracker.exe");
        HX("patcher.exe"); HX("unpacker.exe"); HX("unpacked.exe");
        HX("scylla_hide.exe"); HX("sharpod.exe"); HX("x64dbg-unsigned.exe");
        HX("xenos.exe"); HX("extremeinjector.exe"); HX("resourcehacker.exe");
        HX("autoruns.exe"); HX("autoruns64.exe"); HX("tcpview.exe");
#undef HX
        char low[260] = {};
        size_t n = 0;
        for (; exe[n] && n + 1 < sizeof(low); ++n)
            low[n] = (char)tolower((unsigned char)exe[n]);
        low[n] = 0;
#define HN(s) do { auto _t = XOR(s); if (_t.size() > 2 && strstr(low, _t.c_str())) return true; } while (0)
        HN("x64dbg"); HN("x32dbg"); HN("x96dbg"); HN("ollydbg"); HN("ida64"); HN("wireshark"); HN("fiddler");
        HN("cheatengine"); HN("httpdebugger"); HN("processhacker"); HN("dnspy"); HN("ghidra");
        HN("scylla"); HN("megadumper"); HN("extremedumper"); HN("systeminformer");
        HN("titanhide"); HN("ksdumper"); HN("procexp"); HN("procmon");
        HN("keygen"); HN("keymaker"); HN("cracker"); HN("patcher"); HN("unpacker"); HN("unpacked");
#undef HN
        return false;
    }

    // Overloaded so PROCESSENTRY32::szExeFile resolves whether the build is
    // ANSI (char) or Unicode (wchar_t); a mismatch here broke compilation.
    inline bool nameLooksHostileT(const char* exe) {
        return nameLooksHostile(exe);
    }

    inline bool nameLooksHostileT(const wchar_t* exe) {
        if (!exe || !exe[0]) return false;
        char narrow[260] = {};
        WideCharToMultiByte(CP_ACP, 0, exe, -1, narrow, (int)sizeof(narrow) - 1, nullptr, nullptr);
        return nameLooksHostile(narrow);
    }

    inline bool blacklistedProcessRunning() {
        HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (hSnap == INVALID_HANDLE_VALUE) return false;
        PROCESSENTRY32 pe; pe.dwSize = sizeof(pe);
        bool hit = false;
        if (Process32First(hSnap, &pe)) {
            do {
                if (pe.th32ProcessID == 0 || pe.th32ProcessID == GetCurrentProcessId()) continue;
                if (nameLooksHostileT(pe.szExeFile)) {
                    hit = true;
                    break;
                }
            } while (Process32Next(hSnap, &pe));
        }
        CloseHandle(hSnap);
        return hit;
    }

    inline bool suspiciousParentProcess() {
        DWORD pid = GetCurrentProcessId();
        DWORD ppid = 0;
        HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (hSnap == INVALID_HANDLE_VALUE) return false;
        PROCESSENTRY32 pe; pe.dwSize = sizeof(pe);
        if (Process32First(hSnap, &pe)) {
            do {
                if (pe.th32ProcessID == pid) {
                    ppid = pe.th32ParentProcessID;
                    break;
                }
            } while (Process32Next(hSnap, &pe));
        }
        bool bad = false;
        if (ppid) {
            pe.dwSize = sizeof(pe);
            if (Process32First(hSnap, &pe)) {
                do {
                    if (pe.th32ProcessID == ppid) {
                        bad = nameLooksHostileT(pe.szExeFile);
                        break;
                    }
                } while (Process32Next(hSnap, &pe));
            }
        }
        CloseHandle(hSnap);
        return bad;
    }

    inline bool debuggerWindowPresent() {
#define FW(c) do { auto _c = XOR(c); if (_c.size() > 2 && FindWindowA(_c.c_str(), nullptr)) return true; } while (0)
        FW("OLLYDBG"); FW("WinDbgFrameClass"); FW("ID"); FW("Zeta Debugger");
        FW("Rock Debugger"); FW("ObsidianGUI");
#undef FW
#define FT(t) do { auto _t = XOR(t); if (_t.size() > 2 && FindWindowA(nullptr, _t.c_str())) return true; } while (0)
        FT("x64dbg"); FT("x32dbg"); FT("OllyDbg"); FT("Immunity Debugger");
        FT("IDA -"); FT("IDA Pro"); FT("Cheat Engine"); FT("HTTP Debugger");
        FT("Fiddler"); FT("Wireshark"); FT("Process Hacker"); FT("System Informer");
        FT("dnSpy"); FT("x64dbg"); FT("Process Monitor"); FT("Process Explorer");
#undef FT
        struct Ctx { bool hit; } ctx{ false };
        EnumWindows([](HWND hwnd, LPARAM lp) -> BOOL {
            auto* c = reinterpret_cast<Ctx*>(lp);
            if (!IsWindowVisible(hwnd)) return TRUE;
            char title[256] = {};
            GetWindowTextA(hwnd, title, sizeof(title));
            if (!title[0]) return TRUE;
            char low[256] = {};
            for (int i = 0; title[i] && i + 1 < 256; ++i)
                low[i] = (char)tolower((unsigned char)title[i]);
#define HN(s) do { auto _t = XOR(s); if (_t.size() > 2 && strstr(low, _t.c_str())) { c->hit = true; return FALSE; } } while (0)
            HN("x64dbg"); HN("x32dbg"); HN("ollydbg"); HN("ida pro"); HN("ida -");
            HN("cheat engine"); HN("http debugger"); HN("wireshark");
            HN("fiddler"); HN("process hacker"); HN("system informer"); HN("dnspy");
            HN("ghidra"); HN("scylla"); HN("process monitor"); HN("process explorer");
            HN("reclass"); HN("megadumper"); HN("binary ninja");
#undef HN
            return TRUE;
        }, reinterpret_cast<LPARAM>(&ctx));
        return ctx.hit;
    }

    inline bool hardwareBreakpointsSet() {
        CONTEXT ctx = {};
        ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        HANDLE hThread = OpenThread(
            THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION,
            FALSE, GetCurrentThreadId());
        if (!hThread) return false;
        BOOL ok = GetThreadContext(hThread, &ctx);
        CloseHandle(hThread);
        if (!ok) return false;
        return (ctx.Dr0 || ctx.Dr1 || ctx.Dr2 || ctx.Dr3);
    }

    inline bool timingAnomaly() {
        auto start = std::chrono::high_resolution_clock::now();
        std::this_thread::sleep_for(std::chrono::milliseconds(15));
        auto end = std::chrono::high_resolution_clock::now();
        auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        return diff > 80;
    }

    SHIELD_NOINLINE bool checkSecurity(const std::string& serverUrl = "") {
        static thread_local ULONGLONG lastOkTick = 0;
        const ULONGLONG now = GetTickCount64();
        if (lastOkTick && (now - lastOkTick) < 2000) return false;

        if (vmp::compromised()) return true;
        if (!serverUrl.empty() && hostsTampered(serverUrl)) return true;
        if (blacklistedProcessRunning()) return true;
        if (suspiciousParentProcess()) return true;
        if (debuggerWindowPresent()) return true;
        if (hardwareBreakpointsSet()) return true;
        lastOkTick = GetTickCount64();
        return false;
    }

}

class RakhaAuth {
public:


    enum class Error {
        None = 0,
        NetworkError,
        InvalidCredentials,
        AccountBanned,
        AccountExpired,
        HwidMismatch,
        VpnBlocked,
        IntegrityFail,
        Maintenance,
        UpdateRequired,
        AppDisabled,
        ServerError,
        NotLoggedIn
    };

    static std::string errorStr(Error e) {
        switch (e) {
            case Error::None:               return XOR("OK");
            case Error::NetworkError:       return XOR("No internet connection");
            case Error::InvalidCredentials: return XOR("Invalid license key");
            case Error::AccountBanned:      return XOR("Account suspended");
            case Error::AccountExpired:     return XOR("Subscription expired");
            case Error::HwidMismatch:       return XOR("Device not authorized");
            case Error::VpnBlocked:         return XOR("VPN not allowed");
            case Error::IntegrityFail:      return XOR("Client rejected");
            case Error::Maintenance:        return XOR("Under maintenance");
            case Error::UpdateRequired:     return XOR("Update required");
            case Error::AppDisabled:        return XOR("Service unavailable");
            case Error::ServerError:        return XOR("Authentication failed");
            case Error::NotLoggedIn:        return XOR("Not logged in");
            default:                        return XOR("Authentication failed");
        }
    }


    struct AppInfo {
        bool        success = false;
        Error       error   = Error::None;
        std::string message;
        std::string name;
        std::string version;
        std::string status;
        std::string slug;
    };

    struct LoginResult {
        bool        success      = false;
        Error       error        = Error::None;
        std::string message;

        std::string username;
        std::string hwid;
        std::string subscriptionExpire;
        int         loginCount   = 0;

        std::string appVersion;
        std::string appName;

        std::map<std::string, std::string> variables;
        std::map<std::string, std::string> pack;
    };

    struct HeartbeatResult {
        bool        alive      = false;
        std::string status;
        std::string message;
    };



    RakhaAuth(
        const std::string& appId,
        std::string appSecret,
        const std::string& serverUrl,
        const std::string& version = "",
        bool useHwid = true,
        bool sealedAuth = true,
        const std::string& sslPinSha256 = ""
    )
        : m_appKid()
        , m_serverUrl()
        , m_version(version.empty() ? std::string(XOR("1.0.0")) : version)
        , m_useHwid(useHwid)
        , m_sealedAuth(true)
        , m_sslPin()
        , m_heartbeatRunning(false)
        , m_watchdogRunning(false)
        , m_lastHeartbeatOkMs(0)
        , m_netFailStreak(0)
        , m_suppressKill(false)
    {
        (void)sealedAuth;
        if (!serverUrl.empty()) {
            std::string u = serverUrl;
            m_serverUrl.setAndWipe(u);
        }
        if (!sslPinSha256.empty()) {
            std::string pin = sslPinSha256;
            m_sslPin.setBytes(reinterpret_cast<const uint8_t*>(pin.data()), pin.size());
            RakhaInternal::sslPinVault().setBytes(
                reinterpret_cast<const uint8_t*>(pin.data()), pin.size());
            RakhaInternal::secureWipeString(pin);
        }
        if (!appId.empty()) {
            bool kid = appId.size() == 64;
            if (kid) {
                for (size_t i = 0; i < appId.size(); i++) {
                    const unsigned char c = static_cast<unsigned char>(appId[i]);
                    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
                        kid = false;
                        break;
                    }
                }
            }
            std::string kidNorm;
            if (kid) {
                kidNorm.resize(64);
                for (size_t i = 0; i < 64; i++) {
                    const char c = appId[i];
                    kidNorm[i] = (c >= 'A' && c <= 'F') ? static_cast<char>(c + 32) : c;
                }
            } else {
                kidNorm = makeAppKid(appId);
            }
            m_appKid.setAndWipe(kidNorm);
        }
        if (!appSecret.empty())
            m_appSecret.setAndWipe(appSecret);
        try {
            if (m_useHwid)
                m_hwid = RakhaInternal::getHWID();
            m_pcName = RakhaInternal::getComputerName();
        } catch (...) {
            m_hwid.clear();
        }
    }

    ~RakhaAuth() {
        stopWatchdog();
        stopHeartbeat();
        m_appKid.wipe();
        m_appSecret.wipe();
        m_hsTicket.wipe();
        m_sessKey.wipe();
        m_transportKey.wipe();
        m_serverUrl.wipe();
        m_sslPin.wipe();
        m_sessionToken.wipe();
    }


    void enforceProtection() { killIfUnsafe(); }

    bool bindReady() const {
        return m_appKid.ready() && m_appSecret.ready() && m_serverUrl.ready();
    }


    SHIELD_NOINLINE bool guard() {
        killIfUnsafe();
        if (!isLoggedIn()) return false;
        if (isSubscriptionExpired()) return false;
        return true;
    }

    SHIELD_NOINLINE AppInfo init() {
        AppInfo r;
        m_unboundApp = false;
        killIfUnsafe();
        rejectHost();
        if (!RakhaInternal::enforceTrustedClock(true)) {
            r.success = false;
            r.error = Error::NetworkError;
            r.message = errorStr(Error::NetworkError);
            RakhaInternal::alertNoInternet();
            return r;
        }
        if (!m_sslPin.ready()) {
            r.success = false;
            r.error = Error::ServerError;
            r.message = XOR("Authentication failed");
            return r;
        }
        if (!handshake()) {
            r.success = false;
            applyHandshakeFail(r.error, r.message);
            return r;
        }
        auto resp = postOp(9, XOR("{}"));
        if (!acceptOrDie(resp) && resp.ok) {
            r.error = Error::ServerError;
            r.message = XOR("Response authentication failed");
            return r;
        }
        std::string body = openBody(resp.body);
        if (!resp.ok) {
            if (applyUnbound(false, resp.status, body.empty() ? resp.body : body)) {
                r.error = Error::AppDisabled;
                r.message = XOR("Service unavailable");
                return r;
            }
            if (resp.status == 0)        r.error = Error::NetworkError;
            else if (resp.status == 403) r.error = Error::AppDisabled;
            else if (resp.status == 503) r.error = Error::Maintenance;
            else if (resp.status == 426) r.error = Error::UpdateRequired;
            else                         r.error = Error::ServerError;
            r.message = RakhaInternal::jsonGetString(body, XOR("message"));
            if (r.message.empty()) r.message = errorStr(r.error);
            if (r.error == Error::NetworkError) {
                r.message = errorStr(Error::NetworkError);
                RakhaInternal::alertNoInternet();
            }
            return r;
        }
        r.success = RakhaInternal::jsonGetBool(body, XOR("success"));
        r.name    = RakhaInternal::jsonGetString(body, XOR("name"));
        if (r.name.empty()) {
            size_t appPos = body.find(XOR("\"app\""));
            (void)appPos;
            r.name = RakhaInternal::jsonGetString(body, XOR("name"));
        }
        r.version = RakhaInternal::jsonGetString(body, XOR("version"));
        r.status  = RakhaInternal::jsonGetString(body, XOR("status"));
        r.slug    = RakhaInternal::jsonGetString(body, XOR("slug"));
        if (!r.success || (!r.status.empty() && r.status != XOR("active"))) {
            m_unboundApp = true;
            r.success = false;
            r.error = Error::AppDisabled;
            r.message = XOR("Service unavailable");
            return r;
        }
        return r;
    }


        LoginResult login(const std::string& username, const std::string& password) {
        LoginResult r;
        killIfUnsafe();
        rejectHost();
        if (!RakhaInternal::enforceTrustedClock(true)) {
            r.success = false;
            r.error = Error::NetworkError;
            r.message = errorStr(Error::NetworkError);
            RakhaInternal::alertNoInternet();
            return r;
        }
        if (m_useHwid)
            m_hwid = RakhaInternal::getHWID();
        if (!handshake()) {
            r.success = false;
            applyHandshakeFail(r.error, r.message);
            return r;
        }

        skc::re_encrypt_after_use hsBox;
        if (m_hsTicket.ready()) m_hsTicket.exportLocked(hsBox);
        std::string fileHash = RakhaInternal::getSelfFileHash();
        std::string body = XOR("{\"username\":\"") + RakhaInternal::escapeJson(username) +
                           XOR("\",\"password\":\"") + RakhaInternal::escapeJson(password) + XOR("\"");
        if (m_useHwid && !m_hwid.empty())
            body += XOR(",\"hwid\":\"") + RakhaInternal::escapeJson(m_hwid) + XOR("\"");
        if (!m_pcName.empty())
            body += XOR(",\"pcName\":\"") + RakhaInternal::escapeJson(m_pcName) + XOR("\"");
        if (!fileHash.empty())
            body += XOR(",\"fileHash\":\"") + RakhaInternal::escapeJson(fileHash) + XOR("\"");
        if (hsBox.ready()) {
            hsBox.use([&](const char* p, size_t n) {
                if (!p || !n) return;
                std::string hs(p, n);
                body += XOR(",\"handshake\":\"") + RakhaInternal::escapeJson(hs) + XOR("\"");
                RakhaInternal::secureWipeString(hs);
            });
        }
        body += XOR("}");

        std::string wire = sealBody(RakhaInternal::withOp(3, body));
        if (wire.empty()) {
            RakhaInternal::secureWipeString(body);
            r.error = Error::ServerError;
            r.message = XOR("Request encryption failed");
            return r;
        }
        auto resp = postGate(wire);
        if (!acceptOrDie(resp) && resp.ok) {
            r.error = Error::ServerError;
            r.message = XOR("Response authentication failed");
            return r;
        }
        std::string rb = openBody(resp.body);

        r.success           = RakhaInternal::jsonGetBool(rb, XOR("success"));
        r.message           = RakhaInternal::jsonGetString(rb, XOR("message"));
        r.username          = RakhaInternal::jsonGetString(rb, XOR("username"));
        r.hwid              = RakhaInternal::jsonGetString(rb, XOR("hwid"));
        r.subscriptionExpire = RakhaInternal::jsonGetString(rb, XOR("subscriptionExpire"));
        r.loginCount        = RakhaInternal::jsonGetInt(rb, XOR("loginCount"));
        r.appVersion        = RakhaInternal::jsonGetString(rb, XOR("appVersion"));
        r.appName           = RakhaInternal::jsonGetString(rb, XOR("appName"));
        r.variables         = RakhaInternal::jsonGetObject(rb, XOR("variables"));
        r.pack              = RakhaInternal::jsonGetObject(rb, XOR("pack"));
        std::string sessionToken = RakhaInternal::jsonGetString(rb, XOR("sessionToken"));
        if (!resp.ok || (r.success && sessionToken.empty()))
            r.success = false;

        if (!resp.ok && resp.status == 0) r.error = Error::NetworkError;
        else if (resp.status == 401)      r.error = Error::InvalidCredentials;
        else if (resp.status == 503)      r.error = Error::Maintenance;
        else if (resp.status == 426)      r.error = Error::UpdateRequired;
        else if (resp.status == 403) {
            if (r.message.find(XOR("banned")) != std::string::npos ||
                r.message.find(XOR("suspended")) != std::string::npos)   r.error = Error::AccountBanned;
            else if (r.message.find(XOR("expired")) != std::string::npos) r.error = Error::AccountExpired;
            else if (r.message.find(XOR("device")) != std::string::npos ||
                     r.message.find(XOR("HWID")) != std::string::npos) r.error = Error::HwidMismatch;
            else if (r.message.find(XOR("VPN")) != std::string::npos ||
                     r.message.find(XOR("proxy")) != std::string::npos)   r.error = Error::VpnBlocked;
            else if (r.message.find(XOR("integrity")) != std::string::npos ||
                     r.message.find(XOR("Hash")) != std::string::npos ||
                     r.message.find(XOR("Client rejected")) != std::string::npos) r.error = Error::IntegrityFail;
            else if (r.message.find(XOR("disabled")) != std::string::npos ||
                     r.message.find(XOR("paused")) != std::string::npos ||
                     r.message.find(XOR("Service unavailable")) != std::string::npos) {
                r.error = Error::AppDisabled;
            }
        }

        if (r.success) {

            if (r.username.empty())
                r.username = RakhaInternal::jsonGetString(rb, XOR("username"));

            std::lock_guard<std::mutex> lk(m_mutex);
            m_loggedInUser = r.username.empty() ? username : r.username;
            m_variables    = r.variables;
            m_subExpire    = r.subscriptionExpire;
            m_sessionToken.setAndWipe(sessionToken);
            m_fileHash     = fileHash;
            if (m_useHwid) {
                if (!r.hwid.empty() && r.hwid.size() == 64)
                    m_hwid = r.hwid;
                else
                    m_hwid = RakhaInternal::getHWID();
            }
            m_packGrant    = FileGrant{};
            if (!r.pack.empty()) {
                auto urlIt = r.pack.find(XOR("url"));
                if (urlIt != r.pack.end() && !urlIt->second.empty()) {
                    m_packGrant.url      = urlIt->second;
                    auto pw = r.pack.find(XOR("password"));
                    auto fn = r.pack.find(XOR("filename"));
                    auto hs = r.pack.find(XOR("sha256"));
                    auto src = r.pack.find(XOR("source"));
                    if (pw != r.pack.end()) m_packGrant.password = pw->second;
                    if (fn != r.pack.end()) m_packGrant.filename = fn->second;
                    if (hs != r.pack.end()) m_packGrant.sha256 = hs->second;
                    m_packGrant.remote = (src != r.pack.end() && src->second == XOR("remote"));
                }
            }
            m_lastHeartbeatOkMs = (long long)GetTickCount64();
            m_netFailStreak = 0;
        }
        RakhaInternal::secureWipeString(sessionToken);
        if (r.success)
            startWatchdog();

        if (!r.success && r.message.empty())
            r.message = errorStr(r.error == Error::None ? Error::ServerError : r.error);

        if (!r.success && r.error == Error::NetworkError)
            RakhaInternal::alertNoInternet();

        return r;
    }


    LoginResult loginWithKey(const std::string& key) {
        return login(RakhaInternal::toUpper(key), RakhaInternal::toUpper(key));
    }

    struct RebindResult {
        bool success = false;
        bool unchanged = false;
        std::string message;
        std::string hwid;
        Error error = Error::None;
    };

    RebindResult rebindHwid() {
        RebindResult r;
        killIfUnsafe();
        if (!isLoggedIn()) {
            r.message = XOR("Not logged in");
            r.error = Error::NotLoggedIn;
            return r;
        }

        std::string fresh = RakhaInternal::getHWID();
        if (fresh.empty() || fresh.size() != 64) {
            r.message = XOR("Device fingerprint failed");
            r.error = Error::ServerError;
            return r;
        }

        std::string sessionToken, fileHash;
        {
            std::lock_guard<std::mutex> lk(m_mutex);
            sessionToken = m_sessionToken.ready() ? m_sessionToken.copyEphemeral() : std::string{};
            fileHash = m_fileHash;
        }

        if (sessionToken.empty()) {
            r.message = XOR("Not logged in");
            r.error = Error::NotLoggedIn;
            return r;
        }

        std::string body = XOR("{\"sessionToken\":\"") + RakhaInternal::escapeJson(sessionToken) + XOR("\"");
        body += XOR(",\"hwid\":\"") + RakhaInternal::escapeJson(fresh) + XOR("\"");
        if (!fileHash.empty())
            body += XOR(",\"fileHash\":\"") + RakhaInternal::escapeJson(fileHash) + XOR("\"");
        body += XOR("}");
        RakhaInternal::secureWipeString(sessionToken);

        std::string wire = sealBody(RakhaInternal::withOp(5, body));
        auto resp = postGate(wire, 15000, 2);
        if (!m_suppressKill.load() && !acceptOrDie(resp) && resp.ok) {
            r.error = Error::ServerError;
            r.message = XOR("Response authentication failed");
            return r;
        }
        std::string rb = openBody(resp.body);

        r.success = RakhaInternal::jsonGetBool(rb, XOR("success"));
        r.message = RakhaInternal::jsonGetString(rb, XOR("message"));
        r.unchanged = RakhaInternal::jsonGetBool(rb, XOR("unchanged"));
        r.hwid = RakhaInternal::jsonGetString(rb, XOR("hwid"));
        if (r.hwid.empty()) r.hwid = fresh;

        if (!resp.ok && resp.status == 0) r.error = Error::NetworkError;
        else if (resp.status == 401) r.error = Error::InvalidCredentials;
        else if (resp.status == 403) r.error = Error::HwidMismatch;

        if (r.success) {
            std::lock_guard<std::mutex> lk(m_mutex);
            m_hwid = r.hwid;
        }
        return r;
    }

    void startHeartbeat(int intervalSeconds = 10,
                        std::function<void()> onKick = nullptr)
    {
        stopHeartbeat();
        if (intervalSeconds < 5) intervalSeconds = 5;
        if (intervalSeconds > 180) intervalSeconds = 180;
        m_heartbeatRunning = true;
        // [SECURITY FIX] التقاط مؤشر الـ atomic بدلاً من this الخام
        // الـ destructor يضع m_heartbeatRunning = false وينتظر join()
        // لكن الخيط يفحص الـ flag قبل كل عملية للخروج بأمان
        std::atomic<bool>* pRunning = &m_heartbeatRunning;
        std::atomic<bool>* pSuppressKill = &m_suppressKill;
        m_heartbeatThread = std::thread([this, pRunning, pSuppressKill, intervalSeconds, onKick]() {
            while (pRunning->load()) {
                for (int i = 0; i < intervalSeconds && pRunning->load(); i++) {
                    // فحص الأمان فقط إذا لم يُكبت الإنهاء
                    if (!pSuppressKill->load())
                        killIfUnsafe();
                    std::this_thread::sleep_for(std::chrono::seconds(1));
                }
                if (!pRunning->load()) break;
                HeartbeatResult hb;
                try {
                    hb = heartbeat();
                } catch (...) {
                    const int failures = m_netFailStreak.fetch_add(1) + 1;
                    hb.alive = failures < 3;
                    hb.status = XOR("exception");
                }
                const bool hardKick =
                    hb.status == XOR("session_invalid") || hb.status == XOR("session_expired")
                    || hb.status == XOR("banned") || hb.status == XOR("expired")
                    || hb.status == XOR("hwid_mismatch") || hb.status == XOR("hwid_rebind")
                    || hb.status == XOR("auth_fail") || hb.status == XOR("tamper")
                    || hb.status == XOR("paused") || hb.status == XOR("inactive")
                    || hb.status == XOR("update_required")
                    || (hb.status == XOR("exception") && !hb.alive)
                    || (hb.status == XOR("net_fail") && !hb.alive);
                if (!hb.alive && hardKick) {
                    pRunning->store(false);
                    if (onKick) {
                        onKick();
                        return;
                    }
                    ExitProcess(0);
                    return;
                }
            }
        });
    }


    void stopHeartbeat() {
        m_heartbeatRunning = false;
        if (!m_heartbeatThread.joinable()) return;
        if (m_heartbeatThread.get_id() == std::this_thread::get_id()) {
            m_heartbeatThread.detach();
        } else {
            m_heartbeatThread.join();
        }
    }

    void recycleHttp() {
        RakhaInternal::dropSession();
    }

    void setSuppressKill(bool v) {
        m_suppressKill.store(v);
    }


    HeartbeatResult heartbeat() {
        HeartbeatResult r;
        killIfUnsafe();
        RakhaInternal::assertClockIntegrity();
        std::string user, sessionToken, fileHash, hwid, pcName;
        {
            std::lock_guard<std::mutex> lk(m_mutex);
            user = m_loggedInUser;
            sessionToken = m_sessionToken.ready() ? m_sessionToken.copyEphemeral() : std::string{};
            fileHash = m_fileHash;
            pcName = m_pcName;
            if (!m_useHwid)
                hwid = m_hwid;
        }
        if (m_useHwid)
            hwid = RakhaInternal::getHWID();
        if (user.empty()) { r.alive = false; r.message = XOR("Not logged in"); return r; }


        // Re-read the image periodically; the baseline helper is cached elsewhere.
        std::string liveHash = RakhaInternal::getSelfFileHash(true);
        if (!fileHash.empty() && !liveHash.empty() && liveHash != fileHash) {
            r.alive = false;
            r.status = XOR("tamper");
            r.message = XOR("Binary integrity changed");
            return r;
        }
        if (fileHash.empty()) fileHash = liveHash;

        std::string body = XOR("{\"username\":\"") + RakhaInternal::escapeJson(user) + XOR("\"");
        if (sessionToken.empty()) {
            r.alive = false;
            r.status = XOR("session_invalid");
            r.message = XOR("Not logged in");
            return r;
        }
        body += XOR(",\"sessionToken\":\"") + RakhaInternal::escapeJson(sessionToken) + XOR("\"");
        if (m_useHwid && !hwid.empty())
            body += XOR(",\"hwid\":\"") + RakhaInternal::escapeJson(hwid) + XOR("\"");
        if (!pcName.empty())
            body += XOR(",\"pcName\":\"") + RakhaInternal::escapeJson(pcName) + XOR("\"");
        if (!fileHash.empty())
            body += XOR(",\"fileHash\":\"") + RakhaInternal::escapeJson(fileHash) + XOR("\"");
        body += XOR("}");
        RakhaInternal::secureWipeString(sessionToken);

        std::string wire = sealBody(RakhaInternal::withOp(4, body));
        if (wire.empty()) {
            r.alive = false;
            r.status = XOR("crypto_error");
            return r;
        }
        auto resp = postGate(wire, 8000, 1);
        if (!acceptOrDie(resp) && resp.ok) {
            r.alive = false;
            r.status = XOR("auth_fail");
            r.message = XOR("Response authentication failed");
            return r;
        }
        std::string rb = openBody(resp.body);

        r.alive   = RakhaInternal::jsonGetBool(rb, XOR("alive"));
        r.status  = RakhaInternal::jsonGetString(rb, XOR("status"));
        r.message = RakhaInternal::jsonGetString(rb, XOR("message"));

        if (r.status == XOR("session_invalid") || r.status == XOR("session_expired")
            || r.status == XOR("banned") || r.status == XOR("expired")
            || r.status == XOR("hwid_mismatch") || r.status == XOR("hwid_rebind")
            || r.status == XOR("update_required")) {
            r.alive = false;
        }
        if (resp.status == 426) {
            r.alive = false;
            r.status = XOR("update_required");
            r.message = XOR("Update required");
            return r;
        }
        if (resp.status == 401 || resp.status == 403) {
            r.alive = false;
            if (RakhaInternal::isUnboundAppHttp(resp.status, rb.empty() ? resp.body : rb))
                RakhaInternal::abortUnboundApp();
            if (r.status.empty()) r.status = XOR("auth_fail");
        }

        if (resp.status == 0) {
            const int failures = m_netFailStreak.fetch_add(1) + 1;
            r.alive = failures < 3;
            r.status = XOR("net_fail");
            return r;
        }
        m_netFailStreak = 0;
        if (r.alive) m_lastHeartbeatOkMs = (long long)GetTickCount64();
        return r;
    }

    SHIELD_NOINLINE static bool isDebuggerPresent() {
        if (::IsDebuggerPresent()) return true;

        BOOL remote = FALSE;
        if (CheckRemoteDebuggerPresent(GetCurrentProcess(), &remote) && remote)
            return true;

#if defined(_M_X64) || defined(__x86_64__)
        PVOID peb = (PVOID)__readgsqword(0x60);
        if (peb && (*(ULONG*)((BYTE*)peb + 0xBC) & 0x70)) return true;
        if (peb && *((BYTE*)peb + 2)) return true;
#endif

        typedef LONG(WINAPI* pNtQIP)(HANDLE, UINT, PVOID, ULONG, PULONG);
        HMODULE ntdll = GetModuleHandleA(XOR("ntdll.dll").c_str());
        auto NtQIP = ntdll ? (pNtQIP)GetProcAddress(ntdll, XOR("NtQueryInformationProcess").c_str()) : nullptr;
        if (NtQIP) {
            HANDLE dbgPort = nullptr;
            LONG st = NtQIP(GetCurrentProcess(), 7, &dbgPort, sizeof(dbgPort), nullptr);
            if (st >= 0 && dbgPort) return true;

            ULONG flags = 1;
            st = NtQIP(GetCurrentProcess(), 0x1f, &flags, sizeof(flags), nullptr);
            if (st >= 0 && flags == 0) return true;

            HANDLE hObj = nullptr;
            st = NtQIP(GetCurrentProcess(), 0x1e, &hObj, sizeof(hObj), nullptr);
            if (st >= 0 && hObj) {
                CloseHandle(hObj);
                return true;
            }
        }

        if (VMProtectIsProtected() && VMProtectIsDebuggerPresent(false))
            return true;
        if (RakhaInternal::hardwareBreakpointsSet())
            return true;
        return false;
    }






    std::string getVariable(const std::string& key) {
        if (!guard()) return "";
        std::lock_guard<std::mutex> lk(m_mutex);
        auto it = m_variables.find(key);
        return (it != m_variables.end()) ? it->second : "";
    }


    std::map<std::string, std::string> getVariables() {
        if (!guard()) return {};
        std::lock_guard<std::mutex> lk(m_mutex);
        return m_variables;
    }


    struct RemoteFile {
        std::string id;
        std::string name;
        std::string filename;
        std::string sha256;
        long long   size = 0;
        // "local" streams from your own server, "remote" lives on an external host.
        std::string source;
    };

    // What the server releases once the key, session, device and build all pass.
    struct FileGrant {
        std::string url;
        std::string password;   // archive password, empty for unprotected files
        std::string filename;
        std::string sha256;
        long long   size = 0;
        bool        remote = false;
    };


    std::vector<RemoteFile> listFiles() {
        std::vector<RemoteFile> out;
        if (!guard()) return out;

        std::string body = sessionBody();
        if (body.empty()) return out;
        body += "}";

        std::string wire = sealBody(RakhaInternal::withOp(6, body));
        if (wire.empty()) return out;
        auto resp = postGate(wire, 10000, 1);
        if (!acceptOrDie(resp) && resp.ok) return out;
        std::string rb = openBody(resp.body);
        if (!resp.ok || !RakhaInternal::jsonGetBool(rb, XOR("success"))) return out;

        for (const auto& item : RakhaInternal::jsonGetObjectArray(rb, XOR("files"))) {
            RemoteFile f;
            f.id       = RakhaInternal::jsonGetString(item, XOR("id"));
            f.name     = RakhaInternal::jsonGetString(item, XOR("name"));
            f.filename = RakhaInternal::jsonGetString(item, XOR("filename"));
            f.sha256   = RakhaInternal::jsonGetString(item, XOR("sha256"));
            f.size     = RakhaInternal::jsonGetInt(item, XOR("size"));
            f.source   = RakhaInternal::jsonGetString(item, XOR("source"));
            if (!f.name.empty()) out.push_back(f);
        }
        return out;
    }


    // Asks the server to release a download for this file. Nothing is returned
    // unless the account is authenticated and entitled, so the link never has to
    // exist inside the executable.
    bool getFileLink(const std::string& nameOrId, FileGrant& out) {
        out = FileGrant{};
        if (!guard()) return false;

        auto tryTicket = [&](const std::string& extraJson) -> bool {
            std::string body = sessionBody();
            if (body.empty()) return false;
            body += extraJson + "}";

            std::string wire = sealBody(RakhaInternal::withOp(7, body));
            if (wire.empty()) return false;
            auto resp = postGate(wire, 15000, 1);
            if (!acceptOrDie(resp) && resp.ok) return false;
            std::string rb = openBody(resp.body);
            if (!resp.ok || !RakhaInternal::jsonGetBool(rb, XOR("success"))) return false;

            out.url      = RakhaInternal::jsonGetString(rb, XOR("url"));
            out.password = RakhaInternal::jsonGetString(rb, XOR("password"));
            out.filename = RakhaInternal::jsonGetString(rb, XOR("filename"));
            out.sha256   = RakhaInternal::jsonGetString(rb, XOR("sha256"));
            out.size     = RakhaInternal::jsonGetInt(rb, XOR("size"));
            out.remote   = RakhaInternal::jsonGetString(rb, XOR("source")) == XOR("remote");

            if (!out.url.empty() && out.url.find(XOR("://").c_str()) == std::string::npos) {
                m_serverUrl.withPlain([&](const uint8_t* p, size_t n) {
                    std::string base(p && n ? std::string(reinterpret_cast<const char*>(p), n) : std::string{});
                    if (!base.empty() && base.back() == '/') base.pop_back();
                    if (out.url.front() == '/') out.url = base + out.url;
                    else out.url = base + XOR("/") + out.url;
                    RakhaInternal::secureWipeString(base);
                });
            }
            return !out.url.empty();
        };

        if (nameOrId.empty())
            return tryTicket("");
        std::string esc = RakhaInternal::escapeJson(nameOrId);
        if (tryTicket(std::string(XOR(",\"fileId\":\"")) + esc + XOR("\""))) return true;
        if (tryTicket(std::string(XOR(",\"name\":\"")) + esc + XOR("\""))) return true;
        if (tryTicket(std::string(XOR(",\"id\":\"")) + esc + XOR("\""))) return true;
        return tryTicket(std::string(XOR(",\"fileId\":\"")) + esc
            + XOR("\",\"name\":\"") + esc
            + XOR("\",\"id\":\"") + esc + XOR("\""));
    }


    // Fetches a protected file straight into memory. Nothing is written to disk
    // and the payload is rejected unless its hash matches what the server
    // published, so a swapped or truncated download cannot be used.
    bool downloadFile(const std::string& nameOrId, std::vector<uint8_t>& out) {
        FileGrant grant;
        return downloadFile(nameOrId, out, grant);
    }


    // Same as above but also hands back the archive password, which the caller
    // needs when the file is a password-protected archive on an external host.
    bool downloadFile(const std::string& nameOrId, std::vector<uint8_t>& out,
                      FileGrant& grant)
    {
        out.clear();
        grant = FileGrant{};
        {
            std::lock_guard<std::mutex> lk(m_mutex);
            if (!m_packGrant.url.empty())
                grant = m_packGrant;
        }
        if (grant.url.empty()) {
            if (nameOrId.empty()) {
                auto listed = listFiles();
                if (!listed.empty()) {
                    const std::string pick = listed[0].name.empty() ? listed[0].id : listed[0].name;
                    return downloadFile(pick, out, grant);
                }
            }
            if (!getFileLink(nameOrId, grant)) return false;
        }

        std::string pin;
        if (!grant.remote) {
            m_sslPin.withPlain([&](const uint8_t* k, size_t n) {
                if (k && n) pin.assign(reinterpret_cast<const char*>(k), n);
            });
        }
        auto dl = RakhaInternal::httpGetUrl(grant.url, pin, 180000);
        RakhaInternal::secureWipeString(pin);
        if (!dl.ok || dl.body.empty()) return false;

        std::vector<uint8_t> bytes(dl.body.begin(), dl.body.end());
        if (!dl.body.empty()) SecureZeroMemory(&dl.body[0], dl.body.size());
        if (!bytes.empty() && bytes[0] == '<') {
            SecureZeroMemory(bytes.data(), bytes.size());
            return false;
        }
        const bool validHash = grant.sha256.size() == 64
            && std::all_of(grant.sha256.begin(), grant.sha256.end(), [](unsigned char c) {
                return std::isxdigit(c) != 0;
            });
        if (!validHash || (grant.size > 0 && static_cast<size_t>(grant.size) != bytes.size())) {
            SecureZeroMemory(bytes.data(), bytes.size());
            return false;
        }
        {
            const std::string got = RakhaInternal::sha256Hex(bytes);
            std::string want = grant.sha256;
            for (char& c : want) {
                if (c >= 'A' && c <= 'F') c = static_cast<char>(c + 32);
            }
            if (!RakhaInternal::ctEq(got, want)) {
                if (!bytes.empty()) SecureZeroMemory(bytes.data(), bytes.size());
                return false;
            }
        }
        out.swap(bytes);
        return true;
    }


    std::string getHWID() const { return m_hwid; }
    bool isUnboundApp() const { return m_unboundApp; }


    void ingestSecret(const uint8_t* bytes, size_t n) { m_appSecret.setBytes(bytes, n); }
    void ingestKid(const uint8_t* bytes, size_t n) { m_appKid.setBytes(bytes, n); }
    void ingestServer(const uint8_t* bytes, size_t n) { m_serverUrl.setBytes(bytes, n); }
    void ingestPin(const uint8_t* bytes, size_t n) {
        m_sslPin.setBytes(bytes, n);
        RakhaInternal::sslPinVault().setBytes(bytes, n);
    }


    std::string getUsername() const {
        std::lock_guard<std::mutex> lk(m_mutex);
        return m_loggedInUser;
    }


    bool isLoggedIn() const {
        std::lock_guard<std::mutex> lk(m_mutex);
        return !m_loggedInUser.empty();
    }


    // [SECURITY FIX] استخدام الوقت الموثوق بدلاً من ساعة النظام المحلية
    // ساعة النظام يتحكم فيها المستخدم ويمكنه إرجاعها لتجاوز الانتهاء
    bool isSubscriptionExpired() const {
        std::lock_guard<std::mutex> lk(m_mutex);
        if (m_subExpire.empty()) return false;

        SYSTEMTIME st = {};
        if (sscanf_s(m_subExpire.c_str(), "%hu-%hu-%huT%hu:%hu:%hu",
            &st.wYear, &st.wMonth, &st.wDay,
            &st.wHour, &st.wMinute, &st.wSecond) < 3)
            return false;
        FILETIME ft;
        SystemTimeToFileTime(&st, &ft);
        ULARGE_INTEGER expiry;
        expiry.LowPart = ft.dwLowDateTime;
        expiry.HighPart = ft.dwHighDateTime;
        if (expiry.QuadPart < 116444736000000000ULL) return false;
        const long long expiryUnix = (long long)((expiry.QuadPart - 116444736000000000ULL) / 10000000ULL);
        // trustedUnixNow() يعتمد على الوقت الموثق من السيرفر/NTP + GetTickCount64
        // بدلاً من GetSystemTimeAsFileTime القابلة للتلاعب
        const long long nowUnix = RakhaInternal::trustedUnixNow();
        return nowUnix > expiryUnix;
    }


    void logout() {
        stopHeartbeat();
        std::lock_guard<std::mutex> lk(m_mutex);
        m_loggedInUser.clear();
        m_variables.clear();
        m_subExpire.clear();
        m_sessionToken.wipe();
        m_fileHash.clear();
        m_packGrant = FileGrant{};
    }

    bool ensureGatewaySession() {
        return handshake();
    }


private:

    RakhaInternal::SecureSecret m_appKid;
    RakhaInternal::SecureSecret m_appSecret;
    RakhaInternal::SecureSecret m_hsTicket;
    RakhaInternal::SecureSecret m_sessKey;
    RakhaInternal::SecureSecret m_transportKey;
    RakhaInternal::SecureSecret m_serverUrl;
    RakhaInternal::SecureSecret m_sslPin;
    RakhaInternal::SecureSecret m_sessionToken;
    std::string m_version;
    bool        m_useHwid;
    bool        m_unboundApp = false;
    bool        m_sealedAuth;
    std::string m_hwid;
    std::string m_pcName;

    mutable std::mutex m_mutex;
    std::string        m_loggedInUser;
    std::string        m_subExpire;
    std::string        m_fileHash;
    std::map<std::string, std::string> m_variables;
    FileGrant          m_packGrant;

    std::thread        m_heartbeatThread;
    std::atomic<bool>  m_heartbeatRunning;
    std::thread        m_watchdogThread;
    std::atomic<bool>  m_watchdogRunning;
    std::atomic<long long> m_lastHeartbeatOkMs;
    std::atomic<int>   m_netFailStreak;
    std::atomic<bool>  m_suppressKill;
    std::atomic<int>   m_lastGateStatus{0};
    std::string        m_lastGateMessage;

    void noteGateFail(const RakhaInternal::HttpResult& resp) {
        m_lastGateStatus.store(resp.status, std::memory_order_relaxed);
        std::string rb = openBody(resp.body);
        std::string m = RakhaInternal::jsonGetString(rb, XOR("message"));
        if (m.empty())
            m = RakhaInternal::jsonGetString(resp.body, XOR("message"));
        m_lastGateMessage = m;
    }

    void applyHandshakeFail(Error& err, std::string& msg) {
        const int st = m_lastGateStatus.load(std::memory_order_relaxed);
        if (st == 426) {
            err = Error::UpdateRequired;
            msg = XOR("Update required");
            return;
        }
        if (!m_lastGateMessage.empty()) {
            err = Error::ServerError;
            msg = m_lastGateMessage;
            return;
        }
        err = m_unboundApp ? Error::AppDisabled : Error::ServerError;
        msg = XOR("Authentication failed");
    }

    // Opening fragment of an authenticated request body, without the closing
    // brace so callers can append their own fields. Empty when not logged in.
    std::string sessionBody() {
        std::string user, hwid, fileHash, pcName;
        skc::re_encrypt_after_use tokenBox;
        {
            std::lock_guard<std::mutex> lk(m_mutex);
            user     = m_loggedInUser;
            hwid     = m_hwid;
            fileHash = m_fileHash;
            pcName   = m_pcName;
            if (m_sessionToken.ready()) m_sessionToken.exportLocked(tokenBox);
        }
        if (user.empty() || !tokenBox.ready()) return "";
        if (fileHash.empty()) fileHash = RakhaInternal::getSelfFileHash();

        return tokenBox.use([&](const char* p, size_t n) {
            std::string token(p && n ? std::string(p, n) : std::string{});
            std::string body = XOR("{\"username\":\"") + RakhaInternal::escapeJson(user) + XOR("\"");
            body += XOR(",\"sessionToken\":\"") + RakhaInternal::escapeJson(token) + XOR("\"");
            if (m_useHwid && !hwid.empty())
                body += XOR(",\"hwid\":\"") + RakhaInternal::escapeJson(hwid) + XOR("\"");
            if (!pcName.empty())
                body += XOR(",\"pcName\":\"") + RakhaInternal::escapeJson(pcName) + XOR("\"");
            if (!fileHash.empty())
                body += XOR(",\"fileHash\":\"") + RakhaInternal::escapeJson(fileHash) + XOR("\"");
            RakhaInternal::secureWipeString(token);
            return body;
        });
    }

    SHIELD_NOINLINE void rejectHost() {
        std::string url;
        m_serverUrl.withPlain([&](const uint8_t* p, size_t n) {
            if (p && n) url.assign(reinterpret_cast<const char*>(p), n);
        });
        if (!url.empty()) {
            RakhaInternal::rejectSpoofedAuthHost(url);
            RakhaInternal::secureWipeString(url);
        }
    }

    SHIELD_NOINLINE bool hostUnsafe() {
        std::string url;
        m_serverUrl.withPlain([&](const uint8_t* p, size_t n) {
            if (p && n) url.assign(reinterpret_cast<const char*>(p), n);
        });
        if (url.empty()) return false;
        const bool bad = RakhaInternal::checkSecurity(url);
        RakhaInternal::secureWipeString(url);
        return bad;
    }

    SHIELD_NOINLINE RakhaInternal::HttpResult postToServer(
        const std::string& path,
        const std::string& wire,
        std::map<std::string, std::string> hdrs,
        int timeoutMs = 8000,
        int retries = 0)
    {
        skc::re_encrypt_after_use urlBox;
        m_serverUrl.exportLocked(urlBox);
        std::string url;
        urlBox.use([&](const char* p, size_t n) {
            if (p && n) url.assign(p, n);
        });
        if (url.empty()) return {};
        // Network and host resolution are intentionally outside the secret
        // vault callback so normal I/O latency cannot trip its timing guard.
        auto resp = RakhaInternal::httpPost(url, path, wire, std::move(hdrs), timeoutMs, retries);
        RakhaInternal::secureWipeString(url);
        return resp;
    }

    SHIELD_NOINLINE RakhaInternal::HttpResult postGate(const std::string& wire, int timeoutMs = 8000, int retries = 0) {
        std::string path = gatePath();
        auto hdrs = authHeaders(XOR("POST"), path, wire);
        return postToServer(path, wire, std::move(hdrs), timeoutMs, retries);
    }

    SHIELD_NOINLINE void killIfUnsafe() {
        if (m_suppressKill.load())
            return;
        if (isDebuggerPresent()) {
            m_appSecret.wipe();
            m_sessKey.wipe();
            m_hsTicket.wipe();
            TerminateProcess(GetCurrentProcess(), 0);
            ExitProcess(0);
        }
    }

    void startWatchdog() {
        stopWatchdog();
        m_watchdogRunning = true;
        m_watchdogThread = std::thread([this]() {
            int ticks = 0;
            while (m_watchdogRunning.load()) {
                if (!m_suppressKill.load() && (isDebuggerPresent() || hostUnsafe())) {
                    ExitProcess(0);
                }
                RakhaInternal::assertClockIntegrity();
                if ((++ticks % 6) == 0) {
                    rejectHost();
                }
                for (int i = 0; i < 5 && m_watchdogRunning.load(); i++) {
                    RakhaInternal::assertClockIntegrity();
                    std::this_thread::sleep_for(std::chrono::seconds(1));
                }
            }
        });
    }

    void stopWatchdog() {
        m_watchdogRunning = false;
        if (m_watchdogThread.joinable()) m_watchdogThread.join();
    }

    bool applyUnbound(bool fatal, int status, const std::string& body) {
        if (!RakhaInternal::isUnboundAppHttp(status, body)) return false;
        m_unboundApp = true;
        if (fatal) RakhaInternal::abortUnboundApp();
        return true;
    }

    SHIELD_NOINLINE bool handshake() {
        killIfUnsafe();
        rejectHost();
        m_lastGateStatus.store(0, std::memory_order_relaxed);
        m_lastGateMessage.clear();
        if (!RakhaInternal::enforceTrustedClock(false))
            return false;
        if (m_hsTicket.ready()) return true;

        if (!m_appKid.ready() || !m_appSecret.ready()) {
            m_unboundApp = true;
            m_lastGateMessage = XOR("Authentication failed");
            return false;
        }
        std::string ts = RakhaInternal::getTimestamp();
        std::string nonce = RakhaInternal::randomHex(16);
        if (nonce.empty()) {
            m_lastGateMessage = XOR("Secure random generation failed");
            return false;
        }
        std::string body = RakhaInternal::withOp(1, std::string(XOR("{\"hello\":true,\"ts\":")) + ts +
            XOR(",\"nonce\":\"") + nonce + XOR("\"}"));
        auto helloHdrs = helloHeaders(ts, nonce);
        if (helloHdrs.find(XOR("x-rakha-signature")) != helloHdrs.end()
            || helloHdrs.find(XOR("x-rakha-auth")) != helloHdrs.end()
            || body.find(XOR("hmac")) != std::string::npos) {
            RakhaInternal::hardAbort();
            return false;
        }
        std::string wire = sealBody(body);
        if (wire.empty()) {
            RakhaInternal::secureWipeString(body);
            m_lastGateMessage = XOR("Request encryption failed");
            return false;
        }
        auto resp = postToServer(gatePath(), wire, std::move(helloHdrs));
        if (!body.empty()) SecureZeroMemory(body.data(), body.size());
        if (!wire.empty()) SecureZeroMemory(wire.data(), wire.size());
        if (!acceptOrDie(resp) && resp.ok) {
            m_lastGateMessage = XOR("Response authentication failed");
            return false;
        }
        if (!resp.ok) {
            noteGateFail(resp);
            applyUnbound(false, resp.status, resp.body);
            return false;
        }
        std::string rb = openBody(resp.body);
        if (!RakhaInternal::jsonGetBool(rb, XOR("success")) || !RakhaInternal::jsonGetBool(rb, XOR("welcome"))) {
            return false;
        }

        long long st = RakhaInternal::jsonGetInt64(rb, XOR("serverTime"));
        if (st <= 0) {
            RakhaInternal::hardAbort();
            return false;
        }
        long long skew = RakhaInternal::unixNow() - st;
        if (skew < 0) skew = -skew;
        if (skew > RakhaInternal::kTimeToleranceSec) {
            RakhaInternal::abortClockTamper();
            return false;
        }
        RakhaInternal::noteAuthServerUtc(st);

        std::string session = RakhaInternal::jsonGetString(rb, XOR("session"));
        std::string challenge = RakhaInternal::jsonGetString(rb, XOR("challenge"));
        std::string salt = RakhaInternal::jsonGetString(rb, XOR("salt"));
        std::string serverProof = RakhaInternal::jsonGetString(rb, XOR("serverProof"));
        std::string sessionNonce = RakhaInternal::jsonGetString(rb, XOR("nonce"));
        if (sessionNonce.empty())
            sessionNonce = RakhaInternal::jsonGetString(rb, XOR("sessionNonce"));
        std::string sid;
        {
            size_t dot = session.find('.');
            if (dot == std::string::npos || challenge.size() != 64 || salt.size() != 32) {
                return false;
            }
            sid = session.substr(0, dot);
        }
        if (sessionNonce.empty()) sessionNonce = sid;

        // Server authenticity: HMAC over Welcome must match. A localhost fake
        // without the app secret cannot produce serverProof.
        std::string expect = m_appSecret.hmacParts(
            VMP_STR("rakha-s2c-v1|"), sid, "|", salt, "|", challenge, "|", std::to_string(st));
        if (!RakhaInternal::ctEq(expect, serverProof)) {
            RakhaInternal::secureWipeString(expect);
            m_appSecret.wipe();
            m_unboundApp = true;
            RakhaInternal::abortUnboundApp();
            return false;
        }
        RakhaInternal::secureWipeString(expect);
        RakhaInternal::secureWipeString(serverProof);

        {
            std::string sessHex = m_appSecret.hmacParts(VMP_STR("rakha-sess-v1|"), sid, "|", salt);
            m_sessKey.setAndWipe(sessHex);
        }

        std::string hmac = m_appSecret.hmacParts(
            VMP_STR("rakha-verify-v1|"), sid, "|", salt, "|", challenge);
        std::string vbody = RakhaInternal::withOp(2, std::string(XOR("{\"session\":\"")) + session +
            XOR("\",\"hmac\":\"") + hmac + XOR("\"}"));
        RakhaInternal::secureWipeString(hmac);
        std::string vwire = sealBody(vbody);
        if (!vbody.empty()) SecureZeroMemory(vbody.data(), vbody.size());
        if (vwire.empty()) return false;
        auto vresp = postGate(vwire);
        if (!acceptOrDie(vresp) && vresp.ok) return false;
        if (!vresp.ok) {
            noteGateFail(vresp);
            return false;
        }
        std::string vrb = openBody(vresp.body);
        if (!RakhaInternal::jsonGetBool(vrb, XOR("success"))) { return false; }
        std::string ticket = RakhaInternal::jsonGetString(vrb, XOR("handshake"));
        if (ticket.empty()) { return false; }
        m_hsTicket.setAndWipe(ticket);

        std::string transportSealed = RakhaInternal::jsonGetString(vrb, XOR("transport"));
        if (!transportSealed.empty()) {
            std::string opened = m_appSecret.openJson(transportSealed);
            std::string kB64 = RakhaInternal::jsonGetString(opened, XOR("k"));
            auto keyBytes = RakhaInternal::b64Decode(kB64);
            if (keyBytes.size() == 32) {
                m_transportKey.setBytes(keyBytes.data(), 32);
            }
            RakhaInternal::secureWipeString(opened);
            RakhaInternal::secureWipeString(kB64);
            if (!keyBytes.empty()) SecureZeroMemory(keyBytes.data(), keyBytes.size());
        }

        SecureZeroMemory(session.data(), session.size());
        SecureZeroMemory(challenge.data(), challenge.size());
        SecureZeroMemory(salt.data(), salt.size());
        SecureZeroMemory(sessionNonce.data(), sessionNonce.size());
        return true;
    }

    SHIELD_NOINLINE bool acceptOrDie(const RakhaInternal::HttpResult& resp) {
        vmp::UltraScope protectionScope(VMP_STR("RakhaAuth.VerifyResponse"));
        if (resp.status == 0 && resp.body.empty())
            return false;
        const bool okHttp = resp.status >= 200 && resp.status < 300;
        if (!okHttp)
            return false;
        if (resp.serverTime.empty() || resp.proof.empty()) {
            m_appSecret.wipe();
            return false;
        }
        long long st = 0;
        try { st = std::stoll(resp.serverTime); }
        catch (...) {
            m_appSecret.wipe();
            RakhaInternal::hardAbort();
            return false;
        }
        long long skew = RakhaInternal::unixNow() - st;
        if (skew < 0) skew = -skew;
        if (skew > RakhaInternal::kTimeToleranceSec) {
            m_appSecret.wipe();
            RakhaInternal::abortClockTamper();
            return false;
        }
        skc::re_encrypt_after_use canon;
        canon.set_parts(VMP_STR("rakha-resp-v1|"), resp.serverTime, "|", resp.body);
        std::string expect = m_sessKey.ready() ? m_sessKey.hmacHex(canon) : m_appSecret.hmacHex(canon);
        if (!RakhaInternal::ctEq(expect, resp.proof)) {
            if (!expect.empty()) SecureZeroMemory(expect.data(), expect.size());
            m_appSecret.wipe();
            RakhaInternal::hardAbort();
            return false;
        }
        if (!expect.empty()) SecureZeroMemory(expect.data(), expect.size());
        RakhaInternal::noteAuthServerUtc(st);
        return true;
    }


    SHIELD_NOINLINE static std::string makeAppKid(const std::string& appId) {
        skc::re_encrypt_after_use canon;
        canon.set_parts(VMP_STR("rakha-kid-v1|"), appId);
        std::string kid = canon.use([&](const char* p, size_t n) {
            if (!p || !n) return std::string{};
            std::vector<uint8_t> raw(p, p + n);
            std::string out = RakhaInternal::sha256Hex(raw);
            if (!raw.empty()) SecureZeroMemory(raw.data(), raw.size());
            return out;
        });
        return kid;
    }

    SHIELD_NOINLINE std::string gatePath() {
        return std::string(XOR("/api/q"));
    }

    SHIELD_NOINLINE RakhaInternal::HttpResult postOp(int op, const std::string& plainObj, int timeoutMs = 15000, int retries = 1) {
        std::string payload = RakhaInternal::withOp(op, plainObj);
        std::string wire = sealBody(payload);
        if (!payload.empty()) SecureZeroMemory(payload.data(), payload.size());
        std::string path = gatePath();
        auto resp = postToServer(path, wire, authHeaders(XOR("POST"), path, wire), timeoutMs, retries);
        if (!wire.empty()) SecureZeroMemory(wire.data(), wire.size());
        return resp;
    }

    std::map<std::string, std::string> helloHeaders(const std::string& ts, const std::string& nonce) {
        std::map<std::string, std::string> hdrs{
            {XOR("x-rakha-timestamp"), ts},
            {XOR("x-rakha-nonce"),     nonce},
            {XOR("x-rakha-version"),   m_version},
            {XOR("x-rakha-enc"),       XOR("2")},
            {XOR("Content-Type"),        XOR("application/json")}
        };
        m_appKid.withPlain([&](const uint8_t* k, size_t n) {
            if (k && n) hdrs[XOR("x-rakha-k")].assign(reinterpret_cast<const char*>(k), n);
        });
        return hdrs;
    }

    SHIELD_NOINLINE std::map<std::string, std::string> authHeaders(
        const std::string& method,
        const std::string& path,
        const std::string& body = "",
        const std::string& tsIn = "",
        const std::string& nonceIn = ""
    ) {
        std::string ts = tsIn.empty() ? RakhaInternal::getTimestamp() : tsIn;
        std::string nonce = nonceIn;
        if (nonce.empty()) {
            nonce = RakhaInternal::randomHex(16);
            if (nonce.empty()) return {};
        }
        std::string sig = m_appSecret.hmacParts(
            ts, XOR("\n"), nonce, XOR("\n"), method, XOR("\n"), path, XOR("\n"), body);

        std::map<std::string, std::string> hdrs{
            {XOR("x-rakha-timestamp"),  ts},
            {XOR("x-rakha-nonce"),      nonce},
            {XOR("x-rakha-signature"),  sig},
            {XOR("x-rakha-version"),    m_version},
            {XOR("x-rakha-enc"),        m_transportKey.ready() ? XOR("3") : XOR("2")},
            {XOR("x-rakha-auth"),       XOR("hmac")}
        };
        RakhaInternal::secureWipeString(sig);
        m_appKid.withPlain([&](const uint8_t* k, size_t n) {
            if (k && n) hdrs[XOR("x-rakha-k")].assign(reinterpret_cast<const char*>(k), n);
        });
        if (m_hsTicket.ready()) {
            m_hsTicket.withPlain([&](const uint8_t* k, size_t n) {
                if (k && n) hdrs[XOR("x-rakha-session")].assign(reinterpret_cast<const char*>(k), n);
            });
        }
        return hdrs;
    }

    SHIELD_NOINLINE std::string sealBody(const std::string& plainJson) {
        if (m_transportKey.ready()) {
            return m_transportKey.withPlain([&](const uint8_t* k, size_t n) {
                if (!k || n != 32) return std::string{};
                uint8_t key[32];
                memcpy(key, k, 32);
                std::string sealed = RakhaInternal::aesGcmEncryptRawKey(key, plainJson);
                SecureZeroMemory(key, sizeof(key));
                return sealed;
            });
        }
        return m_appSecret.sealJson(plainJson);
    }

    SHIELD_NOINLINE std::string openBody(const std::string& wire) {
        if (wire.find(XOR("\"enc\":3").c_str()) != std::string::npos && m_transportKey.ready()) {
            std::string pt = m_transportKey.withPlain([&](const uint8_t* k, size_t n) {
                if (!k || n != 32) return std::string{};
                uint8_t key[32];
                memcpy(key, k, 32);
                std::string out = RakhaInternal::aesGcmDecryptRawKey(key, wire);
                SecureZeroMemory(key, sizeof(key));
                return out;
            });
            if (!pt.empty()) return pt;
        }
        return m_appSecret.openJson(wire);
    }
};

#endif
