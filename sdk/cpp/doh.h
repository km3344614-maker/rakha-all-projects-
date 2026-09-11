#pragma once

#include <windows.h>
#include <winhttp.h>
#include <string>
#include <mutex>
#include <cstdio>
#include <cctype>
#include "skStr.h"

#ifndef XOR
#define XOR(s) skCrypt(s).decrypt()
#endif

#pragma comment(lib, "winhttp.lib")

#ifndef WINHTTP_OPTION_SNI_HOSTNAME
#define WINHTTP_OPTION_SNI_HOSTNAME 169
#endif
namespace RakhaInternal {

    inline bool ipv4LiteralOk(const std::string& s) {
        unsigned a = 0, b = 0, c = 0, d = 0;
        char tail = 0;
        if (s.empty() || sscanf_s(s.c_str(), "%u.%u.%u.%u%c", &a, &b, &c, &d, &tail, 1) != 4)
            return false;
        if (a > 255 || b > 255 || c > 255 || d > 255) return false;
        if (a == 0 || a == 127 || a >= 224) return false;
        if (a == 10) return false;
        if (a == 192 && b == 168) return false;
        if (a == 169 && b == 254) return false;
        if (a == 172 && b >= 16 && b <= 31) return false;
        if (a == 100 && b >= 64 && b <= 127) return false;
        return true;
    }

    inline bool hostIsIpv4Literal(const std::string& host) {
        unsigned a = 0, b = 0, c = 0, d = 0;
        char tail = 0;
        return sscanf_s(host.c_str(), "%u.%u.%u.%u%c", &a, &b, &c, &d, &tail, 1) == 4
            && a <= 255 && b <= 255 && c <= 255 && d <= 255;
    }

    inline std::string dohUrlEncode(const std::string& s) {
        std::string out;
        out.reserve(s.size() * 3);
        for (unsigned char c : s) {
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                || c == '.' || c == '-' || c == '_') {
                out.push_back((char)c);
            } else {
                char buf[4];
                sprintf_s(buf, "%%%02X", c);
                out += buf;
            }
        }
        return out;
    }

    inline std::string dohPickIpv4(const std::string& json) {
        size_t pos = 0;
        while (pos < json.size()) {
            size_t d = json.find(XOR("\"data\"").c_str(), pos);
            if (d == std::string::npos) break;
            size_t q = json.find('"', d + 6);
            if (q == std::string::npos) break;
            q = json.find('"', q + 1);
            if (q == std::string::npos) break;
            size_t q2 = json.find('"', q + 1);
            if (q2 == std::string::npos) break;
            std::string val = json.substr(q + 1, q2 - q - 1);
            if (ipv4LiteralOk(val)) return val;
            pos = q2 + 1;
        }
        return {};
    }

    // [SECURITY FIX] تعيين SNI hostname ليتطابق مع شهادة السيرفر
    inline void applySniHostname(HINTERNET hReq, const std::wstring& hostname) {
        if (!hReq || hostname.empty()) return;
        WinHttpSetOption(hReq, WINHTTP_OPTION_SNI_HOSTNAME,
            (LPVOID)hostname.c_str(), (DWORD)((hostname.size() + 1) * sizeof(wchar_t)));
    }

    // [SECURITY FIX] إضافة معامل sniHost لتعيين SNI hostname الصحيح
    // بدلاً من تجاهل خطأ CN الذي يسمح بهجوم MITM على استعلامات DNS
    inline std::string dohHttpsGet(const wchar_t* ip, const wchar_t* sniHost, const wchar_t* path, int timeoutMs) {
        std::string body;
        HINTERNET ses = WinHttpOpen(XOR(L"Mozilla/5.0").c_str(), WINHTTP_ACCESS_TYPE_NO_PROXY,
            WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!ses) return body;
        DWORD proto = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
#ifdef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3
        proto |= WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
#endif
        WinHttpSetOption(ses, WINHTTP_OPTION_SECURE_PROTOCOLS, &proto, sizeof(proto));
        WinHttpSetTimeouts(ses, timeoutMs, timeoutMs, timeoutMs, timeoutMs);
        HINTERNET con = WinHttpConnect(ses, ip, INTERNET_DEFAULT_HTTPS_PORT, 0);
        if (!con) { WinHttpCloseHandle(ses); return body; }
        HINTERNET req = WinHttpOpenRequest(con, XOR(L"GET").c_str(), path, nullptr, WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE);
        if (!req) { WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return body; }
        // [SECURITY FIX] تعيين SNI hostname ليتطابق مع شهادة السيرفر
        // هذا يسمح بالتحقق الطبيعي من CN بدون تجاهله
        if (sniHost && sniHost[0]) {
            applySniHostname(req, sniHost);
        }
        // SNI hostname keeps normal certificate-name validation enabled.
        DWORD sec = SECURITY_FLAG_IGNORE_REVOCATION;
        WinHttpSetOption(req, WINHTTP_OPTION_SECURITY_FLAGS, &sec, sizeof(sec));
        std::wstring hdr = XOR(L"Host: ");
        if (sniHost && sniHost[0])
            hdr += sniHost;
        hdr += XOR(L"\r\nAccept: application/dns-json\r\n");
        if (WinHttpSendRequest(req, hdr.c_str(), (DWORD)hdr.size(), WINHTTP_NO_REQUEST_DATA, 0, 0, 0)
            && WinHttpReceiveResponse(req, nullptr)) {
            for (;;) {
                DWORD avail = 0;
                if (!WinHttpQueryDataAvailable(req, &avail) || !avail) break;
                if (body.size() + avail > 8192) break;
                const size_t at = body.size();
                body.resize(at + avail);
                DWORD read = 0;
                if (!WinHttpReadData(req, &body[at], avail, &read) || !read) {
                    body.resize(at);
                    break;
                }
                body.resize(at + read);
            }
        }
        WinHttpCloseHandle(req);
        WinHttpCloseHandle(con);
        WinHttpCloseHandle(ses);
        return body;
    }

    inline std::wstring dohToWide(const std::string& s) {
        if (s.empty()) return {};
        int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
        if (n <= 0) n = MultiByteToWideChar(CP_ACP, 0, s.c_str(), (int)s.size(), nullptr, 0);
        std::wstring w((size_t)n, 0);
        if (n > 0) {
            if (!MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n))
                MultiByteToWideChar(CP_ACP, 0, s.c_str(), (int)s.size(), &w[0], n);
        }
        return w;
    }


    inline std::string dohResolveIPv4(const std::string& host) {
        if (host.empty() || hostIsIpv4Literal(host)) return {};
        static std::mutex mu;
        static std::string cachedHost;
        static std::string cachedIp;
        static ULONGLONG cachedAt = 0;
        const ULONGLONG now = GetTickCount64();
        {
            std::lock_guard<std::mutex> lk(mu);
            if (cachedHost == host && !cachedIp.empty() && (now - cachedAt) < 60000ull)
                return cachedIp;
        }

        const std::string q = dohUrlEncode(host);
        std::string ip;
        {
            // [SECURITY FIX] تمرير SNI hostname الصحيح لـ Cloudflare
            std::string path = XOR("/dns-query?name=") + q + XOR("&type=A");
            ip = dohPickIpv4(dohHttpsGet(XOR(L"1.1.1.1").c_str(), XOR(L"cloudflare-dns.com").c_str(), dohToWide(path).c_str(), 1600));
        }
        if (ip.empty()) {
            // [SECURITY FIX] تمرير SNI hostname الصحيح لـ Google
            std::string path = XOR("/resolve?name=") + q + XOR("&type=A");
            ip = dohPickIpv4(dohHttpsGet(XOR(L"8.8.8.8").c_str(), XOR(L"dns.google").c_str(), dohToWide(path).c_str(), 1500));
        }
        if (ip.empty()) return {};
        std::lock_guard<std::mutex> lk(mu);
        cachedHost = host;
        cachedIp = ip;
        cachedAt = now;
        return ip;
    }

}
