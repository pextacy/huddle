# SplitKick+ — Phases (Execution Breakdown)

Bu doküman `prd.md` (ne), `docs.md` (nasıl), `plan.md` (ne zaman) ve `claude.md` (kurallar)
dosyalarını **uygulanabilir, dosya/fonksiyon düzeyinde fazlara** indirger. `plan.md` stratejiyi
ve takvimi tutar; bu doküman her fazın somut görev listesi, çıktısı ve "bitti" tanımıdır.

**Altın kural (plan.md §2):** her checkpoint'te çalışan bir uygulama olmalı. De-risk sırası:
Cüzdan → Domain → P2P → Loop → UI. Ödeme yolunu asla en sona bırakma.

**İhlal edilemez kurallar (claude.md):** teslim edilen kodda mock yok · gradient yok ·
para her yerde tamsayı minor unit · `apply` ve `/src/domain` saf/deterministik · seed asla
loglanmaz/replike edilmez · on-chain ödemenin online olduğu UI'da açık.

---

## Faz haritası ve bağımlılıklar

```
Faz 0  Kurulum ──┐
                 ├─► Faz 1  Cüzdan (WDK)  ──┐
Faz 2 Domain ────┘  (1 ve 2 paralel)        ├─► Faz 4  Loop ──► Faz 5  UI/Polish
Faz 3  P2P Ledger ──────────────────────────┘
```

| Faz | İçerik | Cup hedefi (plan.md §3) | Bağımlılık |
|---|---|---|---|
| 0 | Repo + proje iskeleti | Jun 28 kickoff | — |
| 1 | Cüzdan yolu (WDK) | Round of 16 öncesi | Faz 0 |
| 2 | Saf domain mantığı | Faz 1 ile paralel | Faz 0 |
| 3 | P2P ledger (Pears) | Jul 8 — Round of 16 | Faz 0, (2) |
| 4 | Birleştirme loop'u | Jul 10 — Çeyrek Final | Faz 1+2+3 |
| 5 | UI + cilalama | Jul 12–14 — Yarı Final/teslim | Faz 4 |

---

## Faz 0 — Kurulum ve iskelet

**Amaç:** çalışan boş Pear uygulaması, sabitlenmiş bağımlılıklar, lisans.

- [ ] `pear init` ile uygulamayı oluştur; ESM projesi kur (`"type": "module"`).
- [ ] `claude.md`'deki hedef yapıyı kur: `/src/{p2p,wallet,domain,ui}`, `/test`.
- [ ] Bağımlılıkları **tam sürümle** sabitle: `hyperswarm`, `corestore`, `autobase`,
      `hyperbee`, `hypercore-crypto`, `b4a`, `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`.
- [ ] MIT veya Apache-2.0 LICENSE ekle (NFR-4).
- [ ] `package.json` script'leri: `pear run --dev .`, `npm test`.
- [ ] Public GitHub repo; ilk commit.

**Çıktı:** `pear run --dev .` boş kabuğu açar; `npm test` (boş) yeşil.
**Done =** repo public, bağımlılıklar kurulu ve sürümleri pinli, uygulama açılıyor.

---

## Faz 1 — Cüzdan yolu (WDK)  ▸ FR-3, FR-10, FR-12

**Amaç:** kendi-saklamalı (self-custodial) gerçek cüzdan; testnet'te gerçek USD₮ transferi.
Her şey kaysa bile bu tek başına geçerli bir WDK submission'ı (plan.md §2).

Dosyalar: `src/wallet/{wdk.js,config.js,units.js,seed-store.js}`, `scripts/wallet.mjs`,
`src/ui/{wallet-view.js,qr.js}`

- [x] Seed phrase üret/geri yükle (`WDK.getRandomSeedPhrase(24)`); cihaz güvenli deposunda sakla
      (`seed-store.js`, 0600, repo dışı). **Loglanmıyor / ledger'a yazılmıyor / replike edilmiyor.**
- [x] WDK orchestrator + EVM modül kaydı (`registerWallet('ethereum', WalletManagerEvm, { provider, chainId })`).
- [x] `getAddress()` ve `getBalance()`/`getTokenBalance()` **canlı Sepolia RPC**'ye karşı doğrulandı (FR-12).
- [x] `sendUsdt(to, amountMinor)` — gerçek ERC-20 USD₮ transferi (`account.transfer`); **tx hash** döndürür (FR-10).
      Minor unit → 6 ondalıklı big-int dönüşümü **yalnızca `units.js` sınırında** (claude.md money).
- [x] Minimal cüzdan ekranı (solid renk, gradient yok): bakiye, adres + QR (offline), ağ/zincir göstergesi (PRD §8 / FR-12).

> **API doğrulaması:** `docs.md §8.3`'teki `account.sendTransaction({to, token, value})` kurulu
> beta sürümünde **yanlış**; gerçek imza `account.transfer({ token, recipient, amount })` → `{ hash, fee }`.
> Bakiye `getTokenBalance(addr)`, adres `getAddress()`. Kod kurulu API'ye göre yazıldı.

**Done =** kod yolu uçtan uca gerçek ve canlı doğrulandı (gerçek adres türetme, canlı bakiye okuma,
gerçek USDT kontratına karşı `transfer` kurulumu — sıfır bakiyede zincir "exceeds balance" ile revert
etti, yani yol gerçek). Görünür tx hash'li broadcast için adresin testnet faucet'ten fonlanması gerekir
(harici, captcha-kapılı — kullanıcı eylemi).

---

## Faz 2 — Domain mantığı (saf, test edilmiş)  ▸ FR-4, FR-7, FR-8

**Amaç:** bakiye + minimal-transfer settlement, I/O'suz, kanıtlanabilir doğru. Faz 1 ile paralel.
`/src/domain` tamamen saf ve deterministik kalır (claude.md determinism).

Dosyalar: `src/domain/{entries.js,balances.js,settlement.js}`, `test/*`

- [ ] `entries.js`: entry tipleri ve doğrulama — `expense`, `payment`, `wallet`, `addWriter`
      (docs.md §5 şeması). Tutarlar tamsayı minor unit.
- [ ] `balances.js` → `computeBalances(entries)`: net bakiye (+ alacaklı / − borçlu).
      Eşit bölüşümde kalanı **deterministik** dağıt (docs.md §7.1 `splitShares`).
- [ ] `settlement.js` → `settlementPlan(net)`: greedy min-cash-flow → minimal transfer kümesi
      (docs.md §7.2).
- [ ] Birim testleri (worked examples): 5 kişilik gezi → ≤ 4 transfer; kalan dağıtımı; idempotent
      `payment` tx hash üzerinden çift sayılmıyor.

**Not (scope, prd.md §11 / plan.md §6):** önce **equal-only** split; custom split zaman kalırsa.

**Done =** bakiye + minimal settlement test'lerle kanıtlanabilir doğru, hiç I/O yok.

---

## Faz 3 — P2P ledger (Pears)  ▸ FR-1, FR-2, FR-5, FR-6

**Amaç:** sunucusuz, çok-yazarlı, yeniden başlatmaya dayanıklı ortak ledger. İki peer aynı görüşe
yakınsar.

Dosyalar: `src/p2p/{topic.js,swarm.js,ledger.js}`

- [ ] `topic.js`: grup secret'ından deterministik 32-byte topic; invite code round-trip eder
      (`crypto.hash(groupSecret)`, hex invite — docs.md §6.1). (FR-1, FR-2)
- [ ] `swarm.js`: Hyperswarm join (`{ server: true, client: true }`), `store.replicate(conn)`,
      `Pear.teardown(() => swarm.destroy())` ile temiz kapanış / DHT kaydının bırakılması
      (docs.md §6.2).
- [ ] `ledger.js`: Autobase + Hyperbee view; `apply` `addWriter` + entry'leri işler; Corestore ile
      kalıcı (docs.md §6.3). `apply` içinde **`Date.now()` yok**, ts entry payload'ından gelir.
- [ ] İki süreç/cihaz aynı topic'e katılır ve **aynı view'a yakınsar** (FR-5).
- [ ] Yeniden başlatmaya dayanıklı — state lokal'de kalır (FR-6).

**Sürüm uyarısı (docs.md §6.3 not):** Autobase `apply(nodes, view, host)` / `host.addWriter`
imzası sürümlere göre değişti; kurulu sürümün README'sini doğrula (claude.md working style).

**Done =** gerçek çok-yazarlı sync, sunucu yok, restart'tan sağ çıkıyor.

---

## Faz 4 — Birleştirme loop'u  ▸ FR-9, FR-11, FR-13

**Amaç:** cüzdan + ledger'ı birleştiren para döngüsü. Offline ekle → online settle → herkeste temizlenir.

- [ ] Katılımda cüzdan adresini ledger'a yayınla: `{ type: 'wallet', ... }` (docs.md §8.2). (FR-3 sürekliliği)
- [ ] "Settle": plan transfer → WDK USD₮ gönder → `payment` entry yaz (tx hash idempotency key) (FR-9, FR-11).
- [ ] Replike olan `payment`, borcu **tüm peer'lerde** temizler.
- [ ] UI'da online/offline durumu net; settlement bağlantıya bağlı (FR-13, claude.md offline honesty).

**Done =** expense'i offline ekle → online settle et → herkes temizlendiğini görür.

---

## Faz 5 — UI + cilalama  ▸ PRD §8, NFR-4, NFR-5

**Amaç:** bir yabancının dakikalar içinde kurup anlayabileceği, flat ve hızlı arayüz.

Dosyalar: `src/ui/*`

- [ ] PRD ekranları: Home/Groups, Group ledger, Add expense, Settle up, Wallet, Onboarding (PRD §8).
- [ ] **Solid renk, flat, yüksek kontrast tema. Gradient yok.** Dark-mode dostu, büyük tap hedefleri
      (claude.md visual / PRD §8).
- [ ] Empty/error/loading state'leri; **yanılmaya yer bırakmayan offline göstergesi**.
- [ ] Tek komutla kurulum README'si — judge out-of-the-box çalıştırsın (NFR-5).

**Done =** bir yabancı kurar, çalıştırır ve dakikalar içinde anlar.

---

## Scope kesintileri (zaman daralırsa — alttan kes, plan.md §6)

1. Custom (eşit olmayan) split → önce equal-only.
2. Çoklu eşzamanlı grup → tek grubu iyi yap.
3. Süslü onboarding → minimal create/restore + join code.
4. Mobil + masaüstü ikisi birden → offline sync'i en iyi gösteren tek yüzeyi seç.

**Asla kesilmez:** gerçek USD₮ transferi, gerçek P2P sync, para doğruluğu.

---

## Gereksinim → faz izlenebilirliği

| Faz | Karşılanan FR (prd.md §6) |
|---|---|
| 1 | FR-3 (kısmen), FR-10, FR-12 |
| 2 | FR-4, FR-7, FR-8 |
| 3 | FR-1, FR-2, FR-5, FR-6 |
| 4 | FR-3, FR-9, FR-11, FR-13 |
| 5 | (UI bütünü), NFR-4, NFR-5 |

**Sürekli NFR'ler (her fazda geçerli):** NFR-1 self-custody · NFR-2 determinizm ·
NFR-3 offline-first · NFR-6 performans.
