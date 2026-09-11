#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <type_traits>
#include <intrin.h>
#include <utility>
#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif
#include "VMProtectSDK.h"

#if defined(_MSC_VER)
#define SKC_INLINE __forceinline
#define SKC_NOINLINE __declspec(noinline)
#else
#define SKC_INLINE inline __attribute__((always_inline))
#define SKC_NOINLINE __attribute__((noinline))
#endif

namespace skc {

template <typename T>
struct remove_const { using type = T; };
template <typename T>
struct remove_const<const T> { using type = T; };
template <typename T>
struct remove_reference { using type = T; };
template <typename T>
struct remove_reference<T&> { using type = T; };
template <typename T>
struct remove_cv_ref {
    using type = typename remove_const<typename remove_reference<T>::type>::type;
};

constexpr uint32_t fnv1a_u32(const char* s, size_t n, uint32_t h = 2166136261u) {
    for (size_t i = 0; i < n; ++i) {
        h ^= static_cast<uint8_t>(s[i]);
        h *= 16777619u;
    }
    return h;
}

constexpr uint32_t time_seed(const char* t) {
    return (uint32_t)(
        (t[0] - '0') * 36000 + (t[1] - '0') * 3600 +
        (t[3] - '0') * 600 + (t[4] - '0') * 60 +
        (t[6] - '0') * 10 + (t[7] - '0'));
}

constexpr uint32_t rotl32(uint32_t x, unsigned r) {
    r &= 31u;
    return r ? ((x << r) | (x >> (32u - r))) : x;
}

constexpr uint8_t round_key(uint32_t seed, size_t i, int round) {
    uint32_t x = seed ^ (0x7102C96Fu * (uint32_t)(i + 1u + (size_t)round * 19u));
    x = rotl32(x ^ 0x8F460373u, static_cast<unsigned>((round * 7 + 11) & 31));
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    x += 0x47C440F7u ^ (uint32_t)(i * 0x734532DCu);
    x ^= (uint32_t)(round * 0x2572D163u);
    x = (x ^ (x >> 16)) * 0x9904BBDCu;
    x ^= x >> 16;
    x *= 0x49F6E939u;
    x ^= x >> 15;
    return static_cast<uint8_t>(x & 0xFFu);
}

constexpr uint8_t rotl8(uint8_t x, unsigned r) {
    r &= 7u;
    return r ? static_cast<uint8_t>(((x << r) | (x >> (8u - r))) & 0xFFu) : x;
}

constexpr uint8_t rotr8(uint8_t x, unsigned r) {
    r &= 7u;
    return r ? static_cast<uint8_t>(((x >> r) | (x << (8u - r))) & 0xFFu) : x;
}

constexpr size_t gcd_size(size_t a, size_t b) {
    while (b) {
        const size_t t = a % b;
        a = b;
        b = t;
    }
    return a ? a : 1u;
}

constexpr size_t coprime_step(size_t n, size_t prefer) {
    if (n <= 1u) return 1u;
    size_t s = prefer % n;
    if (s == 0u) s = 1u;
    while (gcd_size(s, n) != 1u) {
        s = (s + 1u) % n;
        if (s == 0u) s = 1u;
    }
    return s;
}

constexpr size_t permute_idx(size_t i, size_t n, uint32_t seed) {
    if (n <= 1u) return 0u;
    const size_t step = coprime_step(n, static_cast<size_t>(17u + (seed & 31u)));
    const size_t bias = static_cast<size_t>((seed >> 8) + 11u) % n;
    return (i * step + bias) % n;
}

constexpr uint8_t keystream_byte(uint32_t seed, size_t i, size_t n) {
    uint8_t a = round_key(seed, i, 0);
    uint8_t b = round_key(seed ^ 0x592A408Eu, n - 1 - i, 1);
    uint8_t c = round_key(rotl32(seed, 13u), i * 5u + 3u, 2);
    uint8_t d = round_key(seed + 0x94122FCDu, (i ^ n) + 7u, 3);
    uint8_t e = round_key(seed ^ 0xB7E15163u, (i * 7u + n) ^ 0xA3u, 4);
    uint8_t f = round_key(rotl32(seed, 23u) ^ 0x6C078965u, (n * 3u + i) ^ 0x55u, 5);
    uint8_t g = round_key(seed ^ 0x9E3779B9u, (i * 11u) ^ n, 6);
    uint8_t h = round_key(rotl32(seed, 7u) ^ 0x7F4A7C15u, n * 5u + i + 19u, 7);
    uint8_t raw = static_cast<uint8_t>(a ^ b ^ c ^ d ^ e ^ f ^ g ^ h ^ static_cast<uint8_t>((i * 0x1Bu) & 0xFFu));
    return rotl8(raw, static_cast<unsigned>((i + 1u) % 7u + 1u));
}

// Dual-stream XOR vault. Involution: enc and dec are the same function.
inline void vault_mix(uint8_t* dst, const uint8_t* src, size_t n, const uint8_t* st, size_t stn) {
    if (!dst || !src || !st || n == 0 || stn == 0) return;
    for (size_t i = 0; i < n; i++) {
        const uint8_t a = st[i % stn];
        const uint8_t b = st[(i * 7u + 3u) % stn];
        const uint8_t c = st[(n - 1u - i) % stn];
        const uint8_t d = st[(i * 3u + 11u) % stn];
        dst[i] = static_cast<uint8_t>(
            src[i] ^ a ^ b ^ c ^ d
            ^ static_cast<uint8_t>(i * 0x9Eu)
            ^ static_cast<uint8_t>((i >> 8) * 0x6Du)
            ^ static_cast<uint8_t>((i * i) & 0xFFu));
    }
}

template <typename CharT>
inline SKC_NOINLINE void wipe(CharT* p, size_t n) {
    volatile CharT* v = p;
    for (size_t i = 0; i < n; ++i) {
        v[i] = CharT(0);
#if defined(_MSC_VER)
        _ReadWriteBarrier();
#endif
    }
#if defined(_MSC_VER)
    _ReadWriteBarrier();
#endif
}

SKC_INLINE uint32_t runtime_jitter() {
    uint32_t t = 0;
#if defined(_MSC_VER)
    t ^= static_cast<uint32_t>(__rdtsc() & 0xFFFFFFFFu);
#endif
    t ^= static_cast<uint32_t>(reinterpret_cast<uintptr_t>(&t) * 0x9E3779B9u);
    return t ? t : 0xA5A5A5A5u;
}

SKC_INLINE void fill_stream_n(uint8_t* st, size_t n) {
    uint32_t t = runtime_jitter();
    t ^= static_cast<uint32_t>(reinterpret_cast<uintptr_t>(st));
    for (size_t i = 0; i < n; ++i) {
        t = rotl32(t ^ (0x9E3779B9u * (uint32_t)(i + 1u)), 13u);
        t ^= runtime_jitter();
        st[i] = static_cast<uint8_t>(t >> ((i & 3u) * 8u));
    }
}

SKC_INLINE bool debugger_present_fast() {
#if defined(_WIN32)
    return ::IsDebuggerPresent() != 0;
#else
    return false;
#endif
}

template <size_t N, uint32_t SEED, typename CharT>
class skCrypter {
public:
    static constexpr uint32_t mix_key(size_t i) {
        const uint32_t k1 = keystream_byte(SEED, i, N);
        const uint32_t k2 = keystream_byte(SEED ^ 0xA5A5A5A5u, N - 1u - i, N);
        const uint32_t k3 = keystream_byte(rotl32(SEED, 11u), i * 3u + 5u, N);
        return k1 | (k2 << 8) | (k3 << 16) | ((SEED >> ((i & 3u) * 8u)) << 24);
    }

    static constexpr uint32_t enc_unit(uint32_t ch, size_t i) {
        uint32_t x = ch ^ mix_key(i);
        const unsigned r = static_cast<unsigned>((i % 7u) + 1u);
        if (sizeof(CharT) == 1)
            return rotl8(static_cast<uint8_t>(x & 0xFFu), r);
        const uint32_t lo = rotl8(static_cast<uint8_t>(x & 0xFFu), r);
        const uint32_t hi = rotl8(static_cast<uint8_t>((x >> 8) & 0xFFu), (r + 3u) & 7u);
        return lo | (hi << 8);
    }

    static constexpr uint32_t dec_unit(uint32_t ch, size_t i) {
        const unsigned r = static_cast<unsigned>((i % 7u) + 1u);
        uint32_t x;
        if (sizeof(CharT) == 1) {
            x = rotr8(static_cast<uint8_t>(ch & 0xFFu), r);
        } else {
            const uint32_t lo = rotr8(static_cast<uint8_t>(ch & 0xFFu), r);
            const uint32_t hi = rotr8(static_cast<uint8_t>((ch >> 8) & 0xFFu), (r + 3u) & 7u);
            x = lo | (hi << 8);
        }
        return x ^ mix_key(i);
    }

    constexpr skCrypter(const CharT (&str)[N]) : m_enc{} {
        for (size_t i = 0; i < N; ++i) {
            m_enc[permute_idx(i, N, SEED)] = static_cast<CharT>(
                enc_unit(static_cast<uint32_t>(str[i]), i));
        }
    }

    SKC_NOINLINE void decrypt_into(CharT* out) const {
        if (debugger_present_fast()) {
            for (size_t i = 0; i < N; ++i) out[i] = CharT(0);
            return;
        }
        volatile uint32_t canary = runtime_jitter();
        uint32_t check = canary;
        for (size_t i = 0; i < N; ++i) {
            out[i] = static_cast<CharT>(dec_unit(
                static_cast<uint32_t>(m_enc[permute_idx(i, N, SEED)]), i));
            check ^= static_cast<uint32_t>(out[i]);
            if ((i & 3u) == 3u) {
#if defined(_MSC_VER)
                _ReadWriteBarrier();
#endif
            }
        }
        if (canary == 0) {
            for (size_t i = 0; i < N; ++i) out[i] = CharT(0);
        }
        (void)check;
    }

    SKC_INLINE std::basic_string<CharT> decrypt() const {
        CharT buf[N];
        decrypt_into(buf);
        std::basic_string<CharT> out(buf, N > 0 ? N - 1 : 0);
        wipe(buf, N);
        return out;
    }

    template <typename Fn>
    SKC_INLINE auto use(Fn&& fn) const -> decltype(fn((CharT*)nullptr)) {
        CharT buf[N];
        decrypt_into(buf);
        auto result = fn(static_cast<CharT*>(buf));
        wipe(buf, N);
        return result;
    }

private:
    CharT m_enc[N];
};

template <typename CharT>
class EphemeralString : public std::basic_string<CharT> {
public:
    using Base = std::basic_string<CharT>;

    SKC_INLINE EphemeralString() : Base() {}
    SKC_INLINE EphemeralString(Base&& s) : Base(std::move(s)) {}
    SKC_INLINE EphemeralString(const Base& s) : Base(s) {}
    SKC_INLINE EphemeralString(EphemeralString&& o) noexcept : Base(std::move(o)) {
        o.clear();
    }
    SKC_INLINE EphemeralString& operator=(EphemeralString&& o) noexcept {
        if (this != &o) {
            wipe_self();
            Base::operator=(std::move(o));
            o.clear();
        }
        return *this;
    }

    EphemeralString(const EphemeralString& o) : Base(o) {}
    EphemeralString& operator=(const EphemeralString& o) {
        if (this != &o) {
            wipe_self();
            Base::operator=(o);
        }
        return *this;
    }

    SKC_INLINE ~EphemeralString() { wipe_self(); }

    SKC_INLINE const CharT* get() const { return this->c_str(); }
    SKC_INLINE operator const CharT*() const { return this->c_str(); }

    SKC_INLINE void lock() {
        if (this->empty() || m_locked) return;
        volatile CharT* p = const_cast<CharT*>(this->data());
        for (size_t i = 0; i < this->size(); ++i)
            p[i] = static_cast<CharT>(static_cast<uint32_t>(p[i]) ^ static_cast<uint32_t>((i + 1) * 0x5Bu));
        m_locked = true;
    }

    SKC_INLINE void unlock() {
        if (!m_locked || this->empty()) return;
        volatile CharT* p = const_cast<CharT*>(this->data());
        for (size_t i = 0; i < this->size(); ++i)
            p[i] = static_cast<CharT>(static_cast<uint32_t>(p[i]) ^ static_cast<uint32_t>((i + 1) * 0x5Bu));
        m_locked = false;
    }

private:
    bool m_locked = false;

    SKC_INLINE void wipe_self() {
        if (m_locked) unlock();
        if (!this->empty()) {
            wipe(const_cast<CharT*>(this->data()), this->size());
            this->clear();
            this->shrink_to_fit();
        }
    }
};

// Decrypt → re-key stored blob → use stack plaintext → re-key again → wipe.
// A dump of the object never holds HMAC / app bytes in the clear.
class re_encrypt_after_use {
public:
    re_encrypt_after_use() = default;
    re_encrypt_after_use(const re_encrypt_after_use&) = delete;
    re_encrypt_after_use& operator=(const re_encrypt_after_use&) = delete;

    re_encrypt_after_use(re_encrypt_after_use&& o) noexcept
        : blob(std::move(o.blob)), len(o.len), locked(o.locked)
    {
        memcpy(stream, o.stream, sizeof(stream));
        o.reset();
    }

    re_encrypt_after_use& operator=(re_encrypt_after_use&& o) noexcept {
        if (this != &o) {
            reset();
            blob = std::move(o.blob);
            memcpy(stream, o.stream, sizeof(stream));
            len = o.len;
            locked = o.locked;
            o.reset();
        }
        return *this;
    }

    ~re_encrypt_after_use() { reset(); }

    void set(const void* p, size_t n) {
        reset();
        len = n;
        size_t cap = (n + 15u) & ~size_t(15);
        if (cap == 0) cap = 16;
        blob.assign(cap, 0);
        fill_stream_n(stream, sizeof(stream));
        if (p && n)
            vault_mix(blob.data(), static_cast<const uint8_t*>(p), n, stream, sizeof(stream));
        locked = true;
    }

    void set_string(const std::string& s) { set(s.data(), s.size()); }

    template<typename... Parts>
    void set_parts(Parts&&... parts) {
        std::string acc;
        (append_part(acc, std::forward<Parts>(parts)), ...);
        set(acc.data(), acc.size());
        if (!acc.empty()) {
            skc::wipe(&acc[0], acc.size());
            acc.clear();
            acc.shrink_to_fit();
        }
    }

    bool ready() const { return len > 0 && locked; }

    template<typename Fn>
    auto use(Fn&& fn) -> decltype(fn((const char*)nullptr, size_t{0})) {
        using R = decltype(fn((const char*)nullptr, size_t{0}));
        auto fail = [&]() -> R { return fn(static_cast<const char*>(nullptr), size_t{0}); };
        if (blob.empty() || len == 0 || !locked) return fail();
        if (debugger_present_fast()) return fail();

        constexpr size_t kStack = 512;
        uint8_t stackBuf[kStack];
        uint8_t* plain = stackBuf;
        bool heap = false;
        if (len > kStack) {
            plain = static_cast<uint8_t*>(std::malloc(len));
            if (!plain) return fail();
            heap = true;
        }
        skc::wipe(reinterpret_cast<char*>(plain), heap ? len : kStack);

        vault_mix(plain, blob.data(), len, stream, sizeof(stream));
        encrypt_from(plain, len);

        struct Guard {
            uint8_t* p;
            size_t n;
            bool heap;
            ~Guard() {
                if (p && n) skc::wipe(reinterpret_cast<char*>(p), n);
                if (heap && p) std::free(p);
                p = nullptr;
            }
        } guard{ plain, len, heap };

        if constexpr (std::is_void_v<R>) {
            fn(reinterpret_cast<const char*>(plain), len);
            encrypt_from(plain, len);
            return;
        } else {
            R result = fn(reinterpret_cast<const char*>(plain), len);
            encrypt_from(plain, len);
            return result;
        }
    }

    void reset() {
        if (!blob.empty()) {
            skc::wipe(reinterpret_cast<char*>(blob.data()), blob.size());
            blob.clear();
            blob.shrink_to_fit();
        }
        skc::wipe(reinterpret_cast<char*>(stream), sizeof(stream));
        len = 0;
        locked = false;
    }

private:
    std::vector<uint8_t> blob;
    uint8_t stream[32] = {};
    size_t len = 0;
    bool locked = false;

    static void append_part(std::string& acc, const std::string& s) { acc.append(s); }
    static void append_part(std::string& acc, std::string&& s) {
        acc.append(s);
        if (!s.empty()) skc::wipe(&s[0], s.size());
        s.clear();
    }
    static void append_part(std::string& acc, const EphemeralString<char>& s) { acc.append(s); }
    static void append_part(std::string& acc, const char* s) { if (s) acc.append(s); }
    static void append_part(std::string& acc, char c) { acc.push_back(c); }

    void encrypt_from(const uint8_t* plain, size_t n) {
        skc::wipe(reinterpret_cast<char*>(stream), sizeof(stream));
        fill_stream_n(stream, sizeof(stream));
        if (blob.size() < n) blob.resize((n + 15u) & ~size_t(15), 0);
        vault_mix(blob.data(), plain, n, stream, sizeof(stream));
        locked = true;
        len = n;
    }
};

template <typename CharT = char>
using ReEncryptAfterUse = re_encrypt_after_use;

}

#define skCrypt(str)                                                       \
    []() {                                                                 \
        constexpr auto hidden = ::skc::skCrypter<                          \
            sizeof(str) / sizeof((str)[0]),                                \
            (::skc::time_seed(__TIME__)                                    \
                ^ (uint32_t)(__LINE__ * 0x1000193u)                        \
                ^ (uint32_t)(__COUNTER__ * 0x85EBCA6Bu)                    \
                ^ (uint32_t)(sizeof(str) * 0x9E3779B9u)                    \
                ^ 0xC3A5C85Cu),                                            \
            typename ::skc::remove_cv_ref<decltype((str)[0])>::type>(str); \
        return hidden;                                                     \
    }()

#define RXor(str) (::skc::EphemeralString<typename ::skc::remove_cv_ref<decltype((str)[0])>::type>(skCrypt(str).decrypt()))

#ifndef XOR
#define XOR(s) RXor(s)
#endif

#ifndef E
#define E(s) XOR(s)
#endif

#define RXorW(str) RXor(str)

namespace skc {
template<typename CharT>
inline std::basic_string<CharT> live_copy(const EphemeralString<CharT>& e) {
    if (e.empty()) return {};
    return std::basic_string<CharT>(e.data(), e.size());
}
}
