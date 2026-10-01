// Sayfa içerikleri. Her sayfa: (ctx) => { title, desc, body }.
// ctx: { version, dl: { has, href, name, sha, size }, lang }
import { bird, llmtrLockup, dlButton } from "./parts.mjs";

const MODELS_TABLE_TR = `<div class="tablewrap"><table>
<caption>Esin'in vekil sunucusunun tanıdığı modeller</caption>
<thead><tr><th>Model</th><th>Durum</th><th>Veri</th></tr></thead>
<tbody>
<tr><td><code>greenpt/gpt-oss-120b-eu</code></td><td>Varsayılan</td><td>GreenPT, Fransa (Scaleway). Girdilerle model eğitilmiyor. LLMTR ve GreenPT'de istem/yanıt kaydı yok.</td></tr>
<tr><td><code>qwen/qwen3.6-35b-a3b</code><br><code>qwen/qwen3.6-flash</code></td><td>Seçilebilir: Özelleştir ▸ Esin modeli</td><td><strong>Sağlayıcı tarafında günlük tutulabilir.</strong> Bu yüzden varsayılan değil; seçtiğinde bu fark panelde açıkça yazılıdır.</td></tr>
</tbody></table></div>`;

const MODELS_TABLE_EN = `<div class="tablewrap"><table>
<caption>Models the Esin proxy accepts</caption>
<thead><tr><th>Model</th><th>Status</th><th>Data</th></tr></thead>
<tbody>
<tr><td><code>greenpt/gpt-oss-120b-eu</code></td><td>Default</td><td>GreenPT, France (Scaleway). No training on inputs. No prompt/response logging at LLMTR or GreenPT.</td></tr>
<tr><td><code>qwen/qwen3.6-35b-a3b</code><br><code>qwen/qwen3.6-flash</code></td><td>Selectable: Customize ▸ Esin model</td><td><strong>The provider may keep logs.</strong> That is why they are not the default; when you pick one, the difference is written next to the choice.</td></tr>
</tbody></table></div>`;

const FLOW_TR = `<ol class="flow" aria-label="Esin isteğinin yolu">
<li><b>Sen</b>Soru + bağlamdaki sayfa metni</li>
<li><b>Vento</b>Sadece sen gönderince</li>
<li><b>Vekil</b>esin.cansoykanyilmaz.com; anahtar burada</li>
<li><b>LLMTR</b>Model geçidi</li>
<li><b>GreenPT</b>Fransa</li></ol>`;
const FLOW_EN = `<ol class="flow" aria-label="Path of an Esin request">
<li><b>You</b>Question + text of attached pages</li>
<li><b>Vento</b>Only when you send</li>
<li><b>Proxy</b>esin.cansoykanyilmaz.com; the key lives here</li>
<li><b>LLMTR</b>Model gateway</li>
<li><b>GreenPT</b>France</li></ol>`;

const ESIN_SETTINGS_NOTE_TR = `Esin'in varsayılan modeli LLMTR üzerinden çalışır.`;

export const pages = {
  tr: {
    home: ctx => ({
      title: "Vento — yoldan çekilen bir tarayıcı",
      desc: "Vento, Firefox'un motoru (Gecko) üzerine yazılmış, gizlilik odaklı, sade bir macOS tarayıcısı. Pre-alpha. Yerleşik asistanı Esin yalnızca sen isteyince sayfanı okur.",
      body: `
<section class="wrap hero">
  <div class="hero-copy">
    <p class="kicker">pre-alpha · macOS · ${ctx.version}</p>
    <h1>Bir tarayıcı, <em class="wave">yoldan çekilmeli.</em></h1>
    <p class="lede">Vento, macOS için yazdığımız küçük bir tarayıcı. Motor Firefox'un (Gecko), arayüzün tamamı bize ait. Adı İtalyanca'da rüzgâr: hafif olsun, sayfa önde dursun istedik.</p>
    <p class="cta">${dlButton(ctx, "macOS için indir", "Yakında: DMG hazır değil")}<span class="cta-note">${ctx.dl.has ? `${ctx.version} · Apple Silicon · ${ctx.dl.size}` : `${ctx.version} · Apple Silicon`} · <a href="/indir/">ayrıntılar</a></span></p>
    <p class="fine">İlk sürümlerdeyiz. Çalışıyor, ama eksikleri var; hangilerinin eksik olduğunu aşağıda saklamadan yazdık.</p>
  </div>
  <figure class="sky">
    <div class="sky-panel">${bird()}</div>
    <figcaption>Ebabil, maskotumuz. Aylarca yere konmadan uçan bir kuş.</figcaption>
  </figure>
</section>

<div class="wrap">
<section class="sec" id="neden">
  <div class="tag"><b>01</b>Neden</div>
  <div class="prose">
    <h2>Günün çoğunu orada geçiriyoruz.</h2>
    <p>Tarayıcı en çok açık tuttuğumuz program, ama çoğu zaman bir şey satmaya çalışan ya da arayüzü ile aramızda duran bir şey gibi hissediyoruz. Biz bunu küçültmek istedik: üstte adres çubuğu, bir sıra sekme, altında sayfa. Gerisini gerektiğinde açarsın.</p>
    <p>Motoru sıfırdan yazmadık; çünkü web'in geri kalanının çalışması gerekiyor. Firefox'un motoru bunu yıllardır yapıyor, biz de üstüne kendi kabuğumuzu koyduk.</p>
    <p>Maskotumuz Ebabil, kırlangıca benzeyen bir kuş. Rüzgârı kullanarak kanat çırpmadan süzülür, aylarca yere konmadan uçar. Tarayıcıda da kuşun yaptığını istedik: az çabayla uzağa gitmek.</p>
  </div>
</section>

<section class="sec" id="durum">
  <div class="tag"><b>02</b>Durum</div>
  <div>
    <h2>Ne var, <em>ne yok.</em></h2>
    <p class="prose">Pre-alpha demek, bazı şeylerin henüz olmaması demek. Bunları gizlemek yerine buraya yazıyoruz; karar vermek için yeterli bilgi sende olsun.</p>
    <div class="ledger">
      <div class="have">
        <h3>Şu an çalışanlar</h3>
        <ul>
          <li>Sekmeler; kapatılan sekmeyi geri aç (<kbd>⌘⇧T</kbd>)</li>
          <li>Akıllı çubuk (<kbd>⌘L</kbd>): adres ya da arama; aramalar varsayılan olarak DuckDuckGo'ya gider, istersen Özelleştir panelinden Google seç</li>
          <li>Oturum geri yükleme: sekmelerin açılışta geri gelir</li>
          <li>Sayfada ara, indirmeler, yazdırma (PDF dahil)</li>
          <li>Kamera, mikrofon, konum, bildirim izinleri</li>
          <li>Esin: sayfayı okuyup özetleyen, soru cevaplayan asistan</li>
          <li>Başlangıç ekranı: duvar kâğıtları, Ebabil'i kapatma</li>
          <li>Türkçe ve İngilizce arayüz</li>
        </ul>
      </div>
      <div class="lack">
        <h3>Henüz yok</h3>
        <ul>
          <li>Parola yöneticisi <span class="why">(şimdilik kendi yöneticini kullan)</span></li>
          <li>Eklenti arayüzü</li>
          <li>Hesap / eşitleme</li>
          <li>Çalışma alanları, bölünmüş görünüm <span class="why">(ileride düşünüyoruz, söz değil)</span></li>
          <li>Windows ve Linux <span class="why">(yalnızca macOS)</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>
</div>

<section class="band" id="esin">
  <div class="wrap">
    <div>
      <p class="kicker">Esin</p>
      <h2>Sayfayı okur, <em>sen isteyince.</em></h2>
      <p class="lede">Esin, Vento'nun içindeki asistan. Adı "ilham" demek; "esinti"nin kökü. Bir sayfayı özetler, soruna o sayfaya bakarak cevap verir. Sen bir soru göndermeden sayfandan hiçbir şey çıkmaz, ve neyin gittiğini her mesajın altında görürsün.</p>
      <p><a href="/esin/">Nasıl çalıştığı, hangi model, kimin sunucusu →</a></p>
    </div>
    <p class="note">Varsayılan model, LLMTR üzerinden çalışan <code>greenpt/gpt-oss-120b-eu</code>. Teşekkür ve teknik ayrıntı Esin sayfasında.</p>
  </div>
</section>

<div class="wrap">
<section class="sec" id="kim">
  <div class="tag"><b>03</b>Kim</div>
  <div class="prose">
    <h2>Küçük bir ekip, tek bir adres.</h2>
    <p>Vento'yu <a href="https://cansoykanyilmaz.com">Can Soykan Yılmaz</a> yapıyor. Bir şey bozuksa ya da eksikse <a href="mailto:info@cansoykanyilmaz.com">info@cansoykanyilmaz.com</a> adresine yaz; okuyan bir insan var.</p>
    <p>Bu site çerez kullanmıyor, sayaç koymuyor, başka sunuculardan hiçbir şey yüklemiyor. Yazı tipleri bile buradan geliyor. <a href="/gizlilik/">Gizlilik sayfası</a> tarayıcının kendisi için aynısını anlatıyor.</p>
  </div>
</section>
</div>`,
    }),

    download: ctx => ({
      title: "Vento'yu indir",
      desc: `Vento ${ctx.version}, macOS (Apple Silicon) için pre-alpha. Esin'in varsayılan modeli LLMTR üzerinden çalışır.`,
      body: `
<div class="wrap page-head">
  <p class="kicker">İndir · pre-alpha</p>
  <h1>Vento ${ctx.version}, <em class="wave">macOS için.</em></h1>
  <p class="lede">Apple Silicon (arm64) Mac'ler için derlendi; Intel Mac'te çalıştığını söyleyemeyiz, denemedik.</p>
  <p class="cta">${dlButton(ctx, "DMG'yi indir", "Yakında: DMG henüz yok")}<span class="cta-note">${ctx.dl.has ? `${ctx.dl.name} · ${ctx.dl.size}` : "Hazır olunca bu düğme açılır."}</span></p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="Bu sayfada"><ol><li><a href="#kurulum">Kurulum</a></li><li><a href="#once">İndirmeden önce</a></li><li><a href="#dogrula">Dosyayı doğrula</a></li><li><a href="#llmtr">Esin ve LLMTR</a></li></ol></nav>
  <div class="article">
    <h2 id="kurulum">Kurulum</h2>
    <ol>
      <li>DMG'yi aç.</li>
      <li>Vento'yu Uygulamalar klasörüne sürükle.</li>
      <li>Vento imzalı ve Apple tarafından notarize edilmiş (Developer ID). İlk açılışta macOS yalnızca internetten indirilmiş bir uygulama olduğunu hatırlatıp “Aç” diye sorar; bu normaldir. Başka bir uyarı çıkarsa bize yaz.</li>
    </ol>
    <h2 id="once">İndirmeden önce</h2>
    <p>Bu bir pre-alpha. Günlük tek tarayıcın olmasını önermeyiz: parola yöneticisi henüz yok, güncelleme sunucumuz henüz yayında değil, yeni sürümü bu siteden indirirsin. <a href="/">Tam listeyi</a> ana sayfada yazdık.</p>
    <p>Yeni sürümler bu sayfada yayımlanır; <a href="/surum-notlari/">sürüm notlarında</a> ne değiştiğini görürsün.</p>
    <h2 id="dogrula">Dosyayı doğrula</h2>
    ${ctx.dl.has ? `<p>SHA-256:</p><p><code>${ctx.dl.sha}</code></p><p>Terminalde: <code>shasum -a 256 ${ctx.dl.name}</code></p>` : `<p>DMG yayımlandığında SHA-256 özeti burada olacak.</p>`}
    <h2 id="llmtr">Esin ve LLMTR</h2>
    ${llmtrLockup()}
    <p>Esin'in varsayılan yapay zekâ modeli LLMTR geçidi üzerinden çalışır. Kurulumdan sonra hiçbir anahtar ya da hesap girmen gerekmez. Sayfa metni yalnızca sen Esin'e bir şey sorduğunda gider. Yolu ve veriyle ilgili söylediklerimizin tamamı <a href="/esin/">Esin sayfasında</a>.</p>
  </div>
</div>`,
    }),

    esin: ctx => ({
      title: "Esin ve LLMTR",
      desc: "Esin, Vento'nun yerleşik asistanı. Sayfa metnini yalnızca sen sorunca gönderir. Varsayılan model LLMTR üzerinden greenpt/gpt-oss-120b-eu.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Esin</p>
  <h1>Bir asistan: <em class="wave">sormadan konuşmaz.</em></h1>
  <p class="lede">Esin ("ilham"; esintinin kökü) sayfayı okuyup özetleyen, sorularını o sayfaya bakarak cevaplayan bir panel. <kbd>⌘E</kbd> ile açılır.</p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="Bu sayfada"><ol><li><a href="#nasil">Nasıl çalışır</a></li><li><a href="#yol">İstek nereye gider</a></li><li><a href="#model">Modeller ve veri</a></li><li><a href="#hak">Günlük hak</a></li><li><a href="#llmtr">LLMTR</a></li><li><a href="#acik">Açık kalanlar</a></li></ol></nav>
  <div class="article">
    <h2 id="nasil">Nasıl çalışır</h2>
    <p>Panelde bir soru yazarsın. Açık olan sekme varsayılan olarak bağlama eklenir; bunu panelin altında bir çip olarak görürsün ve × ile çıkarabilirsin. İstersen en çok beş sekmeyi birlikte bağlama ekleyebilirsin. Sayfa metni, sen soruyu gönderince alınır; her sayfadan ilk 20.000 karakter gider. Neyin gittiğini (hangi site, kaç karakter) cevabın yanında görürsün.</p>
    <p>İlk kullanışında Esin nasıl çalıştığını anlatan kısa bir not gösterir, sen "Anladım" diyene kadar hiçbir şey gönderilmez. Sormadığın sürece sayfan Esin'e gitmez.</p>

    <h2 id="yol">İstek nereye gider</h2>
    ${FLOW_TR}
    <p>Tarayıcıda hiçbir API anahtarı yok. İstekler Vento'nun kendi küçük vekil sunucusundan geçer; anahtar yalnızca orada durur. Böylece tarayıcıya gömülü bir anahtarı herkesin çıkarıp kotayı boşaltması mümkün olmaz. Vekil, tarayıcının gönderdiği alanları olduğu gibi iletmez; bildiği alanları yeniden kurar, mesaj sayısına ve uzunluğa sınır koyar, IP başına dakikalık ve günlük bir tavan uygular. Vekil istem ve yanıt içeriğini kaydetmez; yalnızca zamanı, modeli, durum kodunu, mesaj sayısını ve süreyi yazar.</p>

    <h2 id="model">Modeller ve veri</h2>
    ${MODELS_TABLE_TR}
    <p>LLMTR'nin bize yazdığına göre kendi tarafında istem ve yanıt kaydı tutulmuyor (yalnızca model, jeton sayısı ve maliyet). GreenPT modelleri için LLMTR hesabında bir veri aktarım onayı gerekir; bu onay Vento'nun hesabı üzerinden yönetilir, senden ayrıca bir hesap ya da onay istenmez.</p>
    <div class="callout"><p><strong>Fark ne?</strong> Varsayılan modelde sayfa metninin hiçbir yerde saklanmadığını söyleyebiliyoruz. Qwen modellerinde söyleyemiyoruz: sağlayıcı günlük tutabilir. Bu yüzden onları varsayılan yapmadık.</p></div>

    <h2 id="hak">Günlük hak</h2>
    <p>Esin'in arkasındaki model sağlayıcısına ödenen bir bütçe var ve bu bütçe ortak. Bu yüzden Esin'in günlük bir hakkı var: <strong>kişi başına günde 30 soru</strong>. Hak Türkiye saatiyle 00:00'da yenilenir. Panelin altında "Bugün kalan: N / 30" yazar; hak dolunca Vento ne zaman yenileneceğini söyler.</p>
    <p>Bunun yanında tüm kullanıcılar için günlük bir toplam tavan var; o dolarsa Esin o gün kimseye yanıt vermez ve Vento bunu ayrıca belirtir. Sayıları kullanım arttıkça gözden geçireceğiz; burada yazan güncel değerdir.</p>
    <p>Hakkın sayılabilmesi için vekil, isteğin geldiği IP adresinden tuzlu bir özet üretir ve yalnızca o günün sayacı için tutar. Ham IP adresi kaydedilmez, özet ertesi gün silinir. Sağlayıcıya hiç ulaşılamayan bir istek hakkından düşmez.</p>

    <h2 id="llmtr">LLMTR</h2>
    ${llmtrLockup()}
    <p>LLMTR, Knowhy.co'nun geliştirdiği bir yapay zekâ model geçidi (llmtr.com). Vento'nun ilk aşamasında, küçük bir tarayıcıya güvenilir bir varsayılan sağlayıcı lazımdı. Erken bir aşamada, kullanıcı sayımız yok denecek kadar azken konuşmaya açık oldular, Esin'in varsayılan modelini onlar üzerinden çalıştırmamıza ve test için bir bütçe tanımlamaya razı oldular. Teşekkür ederiz.</p>
    <p>Bu, bir sponsorluk etiketi değil; Esin'e yazdığın her şeyin önce onların geçidinden geçtiğini bilmen gereken bir teknik gerçek. Sağlayıcı değişirse bu sayfayı değiştiririz.</p>

    <h2 id="acik">Açık kalanlar</h2>
    <ul>
      <li>Qwen modellerini seçince sağlayıcı günlük tutabilir; Vento bunu seçim yerinde yazar, ama kayıt sağlayıcının elinde olur.</li>
      <li>Kendi API anahtarını ya da cihaz içi bir model kullanma seçeneği bu sürümde yok.</li>
      <li>Esin yalnızca metin okur; sayfada bir şey tıklayıp doldurmaz.</li>
      <li>Esin'in günlük hakkı sınırlı (yukarıda "Günlük hak"); hak dolunca Esin o gün yanıt vermez.</li>
    </ul>
  </div>
</div>`,
    }),

    privacy: ctx => ({
      title: "Gizlilik",
      desc: "Vento hangi ağ isteklerini atar, Esin'le ne gider, bu site ne toplar. Doğrulayabildiklerimizi yazdık, doğrulayamadıklarımızı ayrıca.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Gizlilik</p>
  <h1>Ne gider, <em class="wave">nereye gider.</em></h1>
  <p class="lede">Buraya yalnızca kodda ve ayarlarda gördüğümüz şeyleri yazdık. Emin olmadığımız yerde "bilmiyoruz" dedik.</p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="Bu sayfada"><ol><li><a href="#kisa">Kısaca</a></li><li><a href="#istekler">Vento hangi istekleri atar</a></li><li><a href="#esin">Esin</a></li><li><a href="#hicbir">Yapmadıklarımız</a></li><li><a href="#site">Bu site</a></li><li><a href="#bilmiyoruz">Henüz ölçmediklerimiz</a></li></ol></nav>
  <div class="article">
    <h2 id="kisa">Kısaca</h2>
    <ul>
      <li>Telemetri kapalı. Çökme raporlayıcı derlemede yok. Otomatik güncelleyici var ve kapatılabilir; yalnız bizim sunucumuza bakar (aşağıdaki tabloya bak).</li>
      <li>Vento kabuğunun kendi kodunun attığı istekler aşağıdaki tabloyla sınırlı; biz onlara hiçbir şey eklemedik.</li>
      <li>Esin'e sayfa metni yalnızca sen soru gönderince gider. Varsayılan modelde istem ve yanıt kaydı yok.</li>
      <li>Tarayıcıda API anahtarı yok; istekler bizim vekil sunucudan geçer.</li>
    </ul>

    <h2 id="istekler">Vento hangi istekleri atar</h2>
    <div class="tablewrap"><table>
      <caption>Vento kabuğunun kendi kodundaki ağ istekleri</caption>
      <thead><tr><th>Ne zaman</th><th>Nereye</th><th>Ne gider</th></tr></thead>
      <tbody>
        <tr><td>Adres çubuğuna arama yazıp gönderdiğinde</td><td>Seçtiğin arama motoru: varsayılan duckduckgo.com, istersen google.com</td><td>Arama metni. Google'ı sen seçersen o aramalar Google'ın gizlilik ilkelerine tabi olur.</td></tr>
        <tr><td>Bir siteyi açtığında</td><td>O site</td><td>Her tarayıcıda olan normal web isteği</td></tr>
        <tr><td>Esin'e soru gönderdiğinde</td><td>esin.cansoykanyilmaz.com → LLMTR → GreenPT</td><td>Soru, sohbetin son mesajları, bağlamdaki sayfaların metni</td></tr>
        <tr><td>Güncelleme denetlendiğinde (otomatik açıkken arka planda, ya da Özelleştir ▸ "Güncellemeleri denetle")</td><td>vento.cansoykanyilmaz.com</td><td>Adreste yalnızca yapı hedefi ve kanal adı (ör. Darwin_aarch64-gcc3, vento) bulunur; sürüm, kimlik ya da profil bilgisi yok. Her web isteğinde olduğu gibi sunucu IP adresini görür. Güncelleme dosyası da aynı sunucudan iner ve imzası doğrulanır.</td></tr>
        <tr><td>Bir güncellemeden sonra ilk açılışta</td><td>vento.cansoykanyilmaz.com/surum-notlari/</td><td>Normal bir sayfa isteği (sürüm numarası adreste ?v= olarak yer alır). Yalnızca sürüm yükseldiğinde, bir kez açılır.</td></tr>
        <tr><td>Hata sayfasında "daha fazla bilgi"ye tıkladığında</td><td>support.mozilla.org</td><td>Yalnızca tıklarsan; motorun yardım sayfası bağlantısı</td></tr>
      </tbody>
    </table></div>
    <p>Sertifika hatası sayfasında Firefox'un varsayılan olarak açık olan Mozilla sunucusuna yönelik sertifika denetimi (<code>security.certerrors.mitm.priming</code>) kapalı.</p>

    <h2 id="esin">Esin</h2>
    <p>Ayrıntılı anlatım <a href="/esin/">Esin sayfasında</a>. Özet:</p>
    <ul>
      <li>Sayfa metni (her sayfadan ilk 20.000 karakter, en çok beş sekme) ve sorun, yalnızca sen soruyu gönderince gider. Varsayılan olarak açık sekme bağlamdadır; istemezsen çıkarırsın. Neyin gittiğini cevabın altında görürsün.</li>
      <li>Varsayılan model <code>greenpt/gpt-oss-120b-eu</code>: GreenPT, Fransa (Scaleway). Girdilerle model eğitilmiyor. LLMTR'nin ve GreenPT'nin bize bildirdiğine göre istem ve yanıt kaydı tutulmuyor.</li>
      <li>Qwen modellerinde sağlayıcı günlük tutabilir. Bunlar varsayılan değil; Özelleştir panelinden elle seçersen panel bu farkı yazar.</li>
      <li>Vekil sunucu içeriği kaydetmez; zaman, model, durum, mesaj sayısı ve süre yazar. Web sunucusunun kendi erişim kayıtları (IP adresi, zaman, adres; içerik değil) sunucu yapılandırmasına bağlıdır.</li>
      <li>Günlük hakkını sayabilmek için vekil, IP adresinin tuzlu bir özetini yalnızca o günün sayacı için tutar; ham IP kaydedilmez, özet ertesi gün silinir (<a href="/esin/#hak">ayrıntı</a>).</li>
      <li>GreenPT modelleri için LLMTR hesabında veri aktarım onayı gerekir; onay Vento'nun hesabında yönetilir.</li>
    </ul>

    <h2 id="hicbir">Yapmadıklarımız</h2>
    <ul>
      <li>Sunucularımız var: bu site, güncelleme dosyaları ve Esin'in vekili gerçek, ciddi bir altyapıda çalışıyor. Ama hiçbirini seni izlemek için kullanmıyoruz. Kullanım verisi, tıklama, gezinme geçmişi ya da sekme listesi toplamıyoruz; geçmişin, sekmelerin ve yer imlerin yalnızca bu Mac'te durur. Güçlü altyapı, sıfır takip: Vento'nun varlık sebebi bu. Sunucularımıza ulaşan tek şey, Esin'e bilerek gönderdiklerin ve her web isteğinde olduğu gibi IP adresin (yukarıda ve aşağıda ayrıntısıyla).</li>
      <li>Hesap yok, dolayısıyla seni bir kimliğe bağlayan bir şey yok.</li>
      <li>Reklam ya da izleme ortağı yok.</li>
    </ul>

    <h2 id="site">Bu site</h2>
    <p>Çerez yok, analitik yok, izleyici yok. Başka bir sunucudan hiçbir şey yüklenmez; yazı tipleri (Inter Tight ve Fraunces, OFL) ve görseller de buradan gelir. Sayfalar JavaScript olmadan çalışır; hiç JavaScript kullanmıyoruz. Web sunucusunun standart erişim kayıtları (IP, zaman, adres) barındırma yapılandırmasına bağlıdır.</p>

    <h2 id="bilmiyoruz">Henüz ölçmediklerimiz</h2>
    <p>Firefox'un motoru (Gecko) kendi arka plan istekleri yapabilir (ör. güvenli tarama, uzaktan ayar listeleri, ağ bağlantı denetimi). Bu sürümde bu isteklerin hangilerinin gerçekten atıldığını ağ düzeyinde ölçüp doğrulamadık; doğrulayınca bu bölümü güncelleyeceğiz. Kesin bir "hiçbir şey göndermiyor" cümlesini bu yüzden yazmıyoruz.</p>
    <p>Soru için: <a href="mailto:info@cansoykanyilmaz.com">info@cansoykanyilmaz.com</a></p>
  </div>
</div>`,
    }),

    notes: ctx => ({
      title: "Sürüm notları",
      desc: "Vento sürüm notları: ne eklendi, ne değişti, ne yok.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Sürüm notları</p>
  <h1>Ne <em class="wave">değişti.</em></h1>
  <p class="lede">Kısa ve dürüst tutuyoruz. Olmayan bir şeyi "yakında" diye yazmıyoruz.</p>
</div>
<div class="wrap">
  <section class="release">
    <div><h2>${ctx.version}</h2><p class="date">Eylül 2026 · pre-alpha</p></div>
    <div class="prose">
      <h3>Yeni kabuk</h3>
      <ul>
        <li>Firefox'un motoru (Gecko) üzerinde tamamen kendi arayüzümüz: sekmeler, akıllı çubuk, oturum geri yükleme.</li>
        <li>Sayfada ara (<kbd>⌘F</kbd>), indirmeler paneli, yazdırma (<kbd>⌘P</kbd>, PDF dahil), kapatılan sekmeyi yeniden aç (<kbd>⌘⇧T</kbd>).</li>
        <li>Site izinleri: kamera, mikrofon, konum, bildirim. Sayfa diyalogları Vento tasarımında.</li>
        <li>Sekme simgeleri, sağ tık menüsü, dosya seçici, HTTP kimlik doğrulama, sertifika hata sayfası.</li>
        <li>Türkçe ve İngilizce arayüz; ilk açılışta dil seçimi.</li>
        <li>Arama motoru seçimi: DuckDuckGo (varsayılan) ya da Google, Özelleştir panelinden.</li>
        <li>Yer imleri (<kbd>⌘D</kbd>, araç çubuğunda yıldız, Yer İmleri menüsü) ve başlangıç ekranında sık siteler; hepsi yalnızca bu Mac'te tutulur.</li>
        <li>İlk açılış karşılaması: dil, Esin ve otomatik güncelleme tercihleri; hepsi sonradan Özelleştir panelinden değişir.</li>
        <li>Yerleşik güncelleme altyapısı (MAR imzası doğrulanır), güncelleme sonrası sürüm notları.</li>
      </ul>
      <h3>Esin</h3>
      <ul>
        <li>Sayfayı okuyup özetleyen, soru cevaplayan panel; birden çok sekme bağlama eklenebilir.</li>
        <li>Varsayılan model LLMTR üzerinden <code>greenpt/gpt-oss-120b-eu</code>; istekler Vento'nun vekil sunucusundan geçer. Qwen modelleri Özelleştir panelinden seçilebilir; sağlayıcı günlüğü notu panelde görünür.</li>
        <li>Günlük hak: kişi başına günde 30 soru (Türkiye saatiyle 00:00'da yenilenir); panelin altında kalan hakkın görünür, dolunca yenilenme zamanı yazılır.</li>
        <li>Panelde LLMTR'nin resmi logosu ve bir teşekkür notu.</li>
      </ul>
      <h3>Görünüm</h3>
      <ul>
        <li>Hareket sistemi (hareketi azalt ayarına uyar), Ebabil maskotu, duvar kâğıtları ve "Özelleştir" paneli.</li>
      </ul>
      <h3>Bilinen eksikler</h3>
      <ul>
        <li>Parola yöneticisi, eklenti arayüzü, hesap/eşitleme yok.</li>
        <li>Otomatik güncelleme yerleşik ve kapatılabilir; ama bu ilk sürümde güncelleme sunucuda henüz yayımlanmadı. Yeni sürümler o zamana kadar bu siteden indirilir.</li>
        <li>Yalnızca macOS (Apple Silicon derlemesi).</li>
      </ul>
    </div>
  </section>
</div>`,
    }),

    notFound: ctx => ({
      title: "Sayfa bulunamadı",
      desc: "Aradığın sayfa burada değil.",
      body: `
<div class="wrap err">
  <div>
    <span class="big">404</span>
    <h1>Bu sayfa <em class="wave">uçup gitmiş.</em></h1>
    <p class="lede">Adres yanlış olabilir ya da sayfa taşınmış. <a href="/">Ana sayfadan</a> devam et.</p>
  </div>
  <img src="/assets/img/pose-error.webp" alt="Şaşkın bakan Ebabil" width="512" height="511">
</div>`,
    }),
  },

  en: {
    home: ctx => ({
      title: "Vento — a browser that stays out of the way",
      desc: "Vento is a plain, privacy-minded macOS browser built on Firefox's engine (Gecko). Pre-alpha. Its built-in assistant, Esin, only reads a page when you ask.",
      body: `
<section class="wrap hero">
  <div class="hero-copy">
    <p class="kicker">pre-alpha · macOS · ${ctx.version}</p>
    <h1>A browser should <em class="wave">get out of the way.</em></h1>
    <p class="lede">Vento is a small browser we are writing for macOS. The engine is Firefox's (Gecko); the whole interface is ours. The name is Italian for wind: we wanted it light, with the page in front.</p>
    <p class="cta">${dlButton(ctx, "Download for macOS", "Coming soon: no DMG yet")}<span class="cta-note">${ctx.dl.has ? `${ctx.version} · Apple Silicon · ${ctx.dl.size}` : `${ctx.version} · Apple Silicon`} · <a href="/en/download/">details</a></span></p>
    <p class="fine">We are in the first releases. It works, but things are missing, and we list exactly what below.</p>
  </div>
  <figure class="sky">
    <div class="sky-panel">${bird()}</div>
    <figcaption>Ebabil, our mascot. A swallow-like bird that can fly for months without landing.</figcaption>
  </figure>
</section>

<div class="wrap">
<section class="sec" id="why">
  <div class="tag"><b>01</b>Why</div>
  <div class="prose">
    <h2>We spend most of the day in it.</h2>
    <p>The browser is the program we keep open the longest, and too often it feels like something trying to sell us a thing, or sitting between us and the page. We wanted to shrink that: an address bar on top, a row of tabs, the page below. The rest opens when you need it.</p>
    <p>We did not write the engine from scratch, because the rest of the web has to work. Firefox's engine has been doing that for years, so we put our own shell on top of it.</p>
    <p>Ebabil, our mascot, is a bird like a swallow. It glides on the wind without flapping much and can stay airborne for months. That is what we want from a browser: go far with little effort.</p>
  </div>
</section>

<section class="sec" id="status">
  <div class="tag"><b>02</b>Status</div>
  <div>
    <h2>What exists, <em>what doesn't.</em></h2>
    <p class="prose">Pre-alpha means some things are not there yet. We would rather write them here than hide them, so you have what you need to decide.</p>
    <div class="ledger">
      <div class="have">
        <h3>Working now</h3>
        <ul>
          <li>Tabs, reopen closed tab (<kbd>⌘⇧T</kbd>)</li>
          <li>Smart bar (<kbd>⌘L</kbd>): address or search; searches go to DuckDuckGo by default, or choose Google in the Customize panel</li>
          <li>Session restore: your tabs come back on launch</li>
          <li>Find in page, downloads, printing (incl. PDF)</li>
          <li>Camera, microphone, location, notification permissions</li>
          <li>Esin: an assistant that reads the page and answers questions</li>
          <li>Start screen: wallpapers, option to hide Ebabil</li>
          <li>Turkish and English interface</li>
        </ul>
      </div>
      <div class="lack">
        <h3>Not yet</h3>
        <ul>
          <li>Password manager <span class="why">(use your own for now)</span></li>
          <li>Extensions UI</li>
          <li>Accounts / sync</li>
          <li>Workspaces, split view <span class="why">(we may do them, no promise)</span></li>
          <li>Windows and Linux <span class="why">(macOS only)</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>
</div>

<section class="band" id="esin">
  <div class="wrap">
    <div>
      <p class="kicker">Esin</p>
      <h2>It reads the page, <em>when you ask.</em></h2>
      <p class="lede">Esin is the assistant inside Vento. The name means "inspiration" in Turkish, and shares its root with "esinti", a light breeze. It summarises a page and answers questions by looking at it. Nothing leaves your page until you send a question, and you see what was sent under every message.</p>
      <p><a href="/en/esin/">How it works, which model, whose server →</a></p>
    </div>
    <p class="note">The default model is <code>greenpt/gpt-oss-120b-eu</code>, served through LLMTR. Thanks and technical detail are on the Esin page.</p>
  </div>
</section>

<div class="wrap">
<section class="sec" id="who">
  <div class="tag"><b>03</b>Who</div>
  <div class="prose">
    <h2>A small team, one address.</h2>
    <p>Vento is made by <a href="https://cansoykanyilmaz.com">Can Soykan Yılmaz</a>. If something is broken or missing, write to <a href="mailto:info@cansoykanyilmaz.com">info@cansoykanyilmaz.com</a>; a person reads it.</p>
    <p>This site uses no cookies, no counters, and loads nothing from other servers. Even the fonts come from here. The <a href="/en/privacy/">privacy page</a> says the same for the browser itself.</p>
  </div>
</section>
</div>`,
    }),

    download: ctx => ({
      title: "Download Vento",
      desc: `Vento ${ctx.version}, pre-alpha for macOS (Apple Silicon). Esin's default model runs through LLMTR.`,
      body: `
<div class="wrap page-head">
  <p class="kicker">Download · pre-alpha</p>
  <h1>Vento ${ctx.version}, <em class="wave">for macOS.</em></h1>
  <p class="lede">Built for Apple Silicon (arm64) Macs. We cannot say it runs on Intel Macs; we have not tried.</p>
  <p class="cta">${dlButton(ctx, "Download the DMG", "Coming soon: no DMG yet")}<span class="cta-note">${ctx.dl.has ? `${ctx.dl.name} · ${ctx.dl.size}` : "This button opens when the file is ready."}</span></p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="On this page"><ol><li><a href="#install">Install</a></li><li><a href="#before">Before you download</a></li><li><a href="#verify">Verify the file</a></li><li><a href="#llmtr">Esin and LLMTR</a></li></ol></nav>
  <div class="article">
    <h2 id="install">Install</h2>
    <ol>
      <li>Open the DMG.</li>
      <li>Drag Vento into your Applications folder.</li>
      <li>Vento is signed and notarized by Apple (Developer ID). On first launch macOS only reminds you it was downloaded from the internet and asks you to click “Open”; this is normal. If you see any other warning, write to us.</li>
    </ol>
    <h2 id="before">Before you download</h2>
    <p>This is a pre-alpha. We do not suggest making it your only browser: there is no password manager yet, and our update server is not live yet, so you download new versions from this site. The <a href="/en/">full list</a> is on the home page.</p>
    <p>New versions appear here; the <a href="/en/release-notes/">release notes</a> say what changed.</p>
    <h2 id="verify">Verify the file</h2>
    ${ctx.dl.has ? `<p>SHA-256:</p><p><code>${ctx.dl.sha}</code></p><p>In Terminal: <code>shasum -a 256 ${ctx.dl.name}</code></p>` : `<p>The SHA-256 checksum will be here once the DMG is published.</p>`}
    <h2 id="llmtr">Esin and LLMTR</h2>
    ${llmtrLockup()}
    <p>Esin's default AI model runs through the LLMTR gateway. After installing you do not need to enter any key or account. Page text is sent only when you ask Esin something. The full path and what we say about data are on the <a href="/en/esin/">Esin page</a>.</p>
  </div>
</div>`,
    }),

    esin: ctx => ({
      title: "Esin and LLMTR",
      desc: "Esin is Vento's built-in assistant. It sends page text only when you ask. The default model runs through LLMTR: greenpt/gpt-oss-120b-eu.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Esin</p>
  <h1>An assistant that <em class="wave">doesn't speak unasked.</em></h1>
  <p class="lede">Esin ("inspiration"; the root of "esinti", a light breeze) is a panel that reads the page, summarises it and answers your questions by looking at it. Open it with <kbd>⌘E</kbd>.</p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="On this page"><ol><li><a href="#how">How it works</a></li><li><a href="#path">Where a request goes</a></li><li><a href="#models">Models and data</a></li><li><a href="#allowance">Daily allowance</a></li><li><a href="#llmtr">LLMTR</a></li><li><a href="#open">Open points</a></li></ol></nav>
  <div class="article">
    <h2 id="how">How it works</h2>
    <p>You type a question in the panel. The tab you have open is attached by default; you see it as a chip under the panel and can remove it with ×. You can attach up to five tabs together. Page text is read when you send the question; the first 20,000 characters of each page go. You see what was sent (which site, how many characters) next to the answer.</p>
    <p>The first time, Esin shows a short note on how it works, and nothing is sent until you say "Got it". Unless you ask, your page does not go to Esin.</p>

    <h2 id="path">Where a request goes</h2>
    ${FLOW_EN}
    <p>There is no API key in the browser. Requests go through Vento's own small proxy server, and the key lives only there. That way nobody can extract a key embedded in the browser and drain the quota. The proxy does not pass along whatever the browser sends; it rebuilds the fields it knows, caps message count and length, and applies a per-minute and a daily limit per IP. The proxy does not record prompt or response content; it writes only the time, model, status code, message count and duration.</p>

    <h2 id="models">Models and data</h2>
    ${MODELS_TABLE_EN}
    <p>According to what LLMTR told us, they keep no prompt or response records on their side (only model, token count and cost). GreenPT models require a data-transfer approval in the LLMTR account; this is managed through Vento's account, and you are not asked to create an account or approve anything.</p>
    <div class="callout"><p><strong>What is the difference?</strong> With the default model we can say page text is stored nowhere. With the Qwen models we cannot: the provider may keep logs. That is why they are not the default.</p></div>

    <h2 id="allowance">Daily allowance</h2>
    <p>There is a paid budget behind Esin's model provider, and it is shared. So Esin has a daily allowance: <strong>30 questions per person per day</strong>. It renews at 00:00 Turkey time. The panel shows "Left today: N / 30" underneath; when it runs out, Vento tells you when it renews.</p>
    <p>There is also a daily total ceiling for all users; if that is reached, Esin answers nobody for the rest of the day and Vento says so separately. We will review the numbers as usage grows; what is written here is the current value.</p>
    <p>To count your allowance the proxy makes a salted digest of the IP address a request came from and keeps it only for that day's counter. The raw IP address is not recorded, and the digest is deleted the next day. A request that never reached the provider does not count against you.</p>

    <h2 id="llmtr">LLMTR</h2>
    ${llmtrLockup()}
    <p>LLMTR is an AI model gateway built by Knowhy.co (llmtr.com). In its early days a small browser needs a dependable default provider. They were open to talking at a point when we had almost no users, agreed to let Esin's default model run through them, and set up a test budget. Thank you.</p>
    <p>This is not a sponsor badge; it is a technical fact you should know: what you write to Esin passes through their gateway first. If the provider changes, we change this page.</p>

    <h2 id="open">Open points</h2>
    <ul>
      <li>If you choose a Qwen model the provider may keep logs; Vento says so at the choice, but the logs are in the provider's hands.</li>
      <li>Using your own API key or an on-device model is not in this version.</li>
      <li>Esin only reads text; it does not click or fill things in on a page.</li>
      <li>Esin's daily allowance is limited (see "Daily allowance" above); once used up, Esin does not answer until it renews.</li>
    </ul>
  </div>
</div>`,
    }),

    privacy: ctx => ({
      title: "Privacy",
      desc: "Which network requests Vento makes, what goes out with Esin, what this site collects. What we could verify, and what we could not.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Privacy</p>
  <h1>What goes out, <em class="wave">and where.</em></h1>
  <p class="lede">We only wrote what we saw in the code and the settings. Where we are not sure, we say "we don't know".</p>
</div>
<div class="wrap cols">
  <nav class="toc" aria-label="On this page"><ol><li><a href="#short">In short</a></li><li><a href="#requests">Requests Vento makes</a></li><li><a href="#esin">Esin</a></li><li><a href="#never">What we don't do</a></li><li><a href="#site">This site</a></li><li><a href="#unknown">Not yet measured</a></li></ol></nav>
  <div class="article">
    <h2 id="short">In short</h2>
    <ul>
      <li>Telemetry is off. The crash reporter is not in the build. There is an automatic updater; it can be turned off and only talks to our server (see the table below).</li>
      <li>The requests made by Vento's own shell code are limited to the table below; we added nothing else.</li>
      <li>Page text goes to Esin only when you send a question. The default model keeps no prompt/response logs.</li>
      <li>No API key in the browser; requests pass through our proxy.</li>
    </ul>

    <h2 id="requests">Requests Vento makes</h2>
    <div class="tablewrap"><table>
      <caption>Network requests in Vento's own shell code</caption>
      <thead><tr><th>When</th><th>To</th><th>What goes</th></tr></thead>
      <tbody>
        <tr><td>You type a search in the address bar and submit</td><td>The search engine you chose: duckduckgo.com by default, google.com if you pick it</td><td>The search text. If you choose Google, those searches fall under Google's privacy policy.</td></tr>
        <tr><td>You open a site</td><td>That site</td><td>The normal web request any browser makes</td></tr>
        <tr><td>You send a question to Esin</td><td>esin.cansoykanyilmaz.com → LLMTR → GreenPT</td><td>The question, the last messages of the chat, the text of attached pages</td></tr>
        <tr><td>An update check (in the background when automatic updates are on, or Customize ▸ "Check for updates")</td><td>vento.cansoykanyilmaz.com</td><td>The URL carries only the build target and channel name (e.g. Darwin_aarch64-gcc3, vento); no version, ID or profile data. As with any web request the server sees your IP address. The update file downloads from the same server and its signature is verified.</td></tr>
        <tr><td>First launch after an update</td><td>vento.cansoykanyilmaz.com/en/release-notes/</td><td>A normal page request (the version number is in the URL as ?v=). Opened once, only when the version goes up.</td></tr>
        <tr><td>You click "more information" on an error page</td><td>support.mozilla.org</td><td>Only if you click; a link to the engine's help page</td></tr>
      </tbody>
    </table></div>
    <p>On certificate error pages, Firefox's default-on check against a Mozilla server (<code>security.certerrors.mitm.priming</code>) is turned off.</p>

    <h2 id="esin">Esin</h2>
    <p>Details are on the <a href="/en/esin/">Esin page</a>. Summary:</p>
    <ul>
      <li>Page text (first 20,000 characters per page, up to five tabs) and your question go only when you send it. The open tab is attached by default; remove it if you do not want it. You see what was sent under the answer.</li>
      <li>Default model <code>greenpt/gpt-oss-120b-eu</code>: GreenPT, France (Scaleway). No training on inputs. According to LLMTR and GreenPT, no prompt or response is logged.</li>
      <li>With Qwen models the provider may keep logs. They are not the default; if you pick one by hand in the Customize panel, the panel states this difference.</li>
      <li>The proxy does not record content; it writes time, model, status, message count and duration. The web server's own access logs (IP address, time, URL; not content) depend on server configuration.</li>
      <li>To count your daily allowance the proxy keeps a salted digest of your IP address only for that day's counter; the raw IP is not recorded and the digest is deleted the next day (<a href="/en/esin/#allowance">details</a>).</li>
      <li>GreenPT models need a data-transfer approval in the LLMTR account; it is managed in Vento's account.</li>
    </ul>

    <h2 id="never">What we don't do</h2>
    <ul>
      <li>We do have servers: this site, the update files and Esin's proxy run on real, serious infrastructure. But we use none of it to watch you. We collect no usage data, clicks, browsing history or tab lists; your history, tabs and bookmarks stay on this Mac. Strong infrastructure, zero tracking: that is the whole point of Vento. The only things that reach our servers are what you knowingly send to Esin and, as with any web request, your IP address (detailed above and below).</li>
      <li>There are no accounts, so nothing ties you to an identity.</li>
      <li>No advertising or tracking partners.</li>
    </ul>

    <h2 id="site">This site</h2>
    <p>No cookies, no analytics, no trackers. Nothing is loaded from other servers; the fonts (Inter Tight and Fraunces, OFL) and images come from here too. The pages work without JavaScript; we use none. The web server's standard access logs (IP, time, URL) depend on the hosting configuration.</p>

    <h2 id="unknown">Not yet measured</h2>
    <p>Firefox's engine (Gecko) can make its own background requests (for example safe browsing, remote settings lists, network connectivity checks). We have not yet measured at the network level which of these actually fire in this version; we will update this section when we have. That is why we do not write a flat "it sends nothing".</p>
    <p>Questions: <a href="mailto:info@cansoykanyilmaz.com">info@cansoykanyilmaz.com</a></p>
  </div>
</div>`,
    }),

    notes: ctx => ({
      title: "Release notes",
      desc: "Vento release notes: what was added, what changed, what is missing.",
      body: `
<div class="wrap page-head">
  <p class="kicker">Release notes</p>
  <h1>What <em class="wave">changed.</em></h1>
  <p class="lede">Short and honest. We do not write "soon" for things that do not exist.</p>
</div>
<div class="wrap">
  <section class="release">
    <div><h2>${ctx.version}</h2><p class="date">September 2026 · pre-alpha</p></div>
    <div class="prose">
      <h3>New shell</h3>
      <ul>
        <li>A fully custom interface on top of Firefox's engine (Gecko): tabs, smart bar, session restore.</li>
        <li>Find in page (<kbd>⌘F</kbd>), downloads panel, printing (<kbd>⌘P</kbd>, incl. PDF), reopen closed tab (<kbd>⌘⇧T</kbd>).</li>
        <li>Site permissions: camera, microphone, location, notifications. Page dialogs in Vento's design.</li>
        <li>Tab icons, context menu, file picker, HTTP authentication, certificate error page.</li>
        <li>Turkish and English interface; language choice on first launch.</li>
        <li>Search engine choice: DuckDuckGo (default) or Google, in the Customize panel.</li>
        <li>Bookmarks (<kbd>⌘D</kbd>, a star in the toolbar, the Bookmarks menu) and frequent sites on the start screen; all kept on this Mac only.</li>
        <li>A first-launch welcome: language, Esin and automatic-update choices; all changeable later in the Customize panel.</li>
        <li>Built-in update machinery (MAR signature verified), release notes after an update.</li>
      </ul>
      <h3>Esin</h3>
      <ul>
        <li>A panel that reads the page and answers questions; several tabs can be attached.</li>
        <li>Default model <code>greenpt/gpt-oss-120b-eu</code> through LLMTR; requests pass through Vento's proxy. Qwen models can be chosen in the Customize panel, with a note about provider logging.</li>
        <li>Daily allowance: 30 questions per person per day (renews at 00:00 Turkey time); the panel shows what is left and, once used up, when it renews.</li>
        <li>LLMTR's official logo and a thank-you note in the panel.</li>
      </ul>
      <h3>Look</h3>
      <ul>
        <li>A motion system (respects reduced motion), the Ebabil mascot, wallpapers and a "Customize" panel.</li>
      </ul>
      <h3>Known gaps</h3>
      <ul>
        <li>No password manager, extensions UI, accounts or sync.</li>
        <li>Automatic updating is built in and can be turned off, but no update has been published on the server for this first release yet. Until then, new versions are downloaded from this site.</li>
        <li>macOS only (Apple Silicon build).</li>
      </ul>
    </div>
  </section>
</div>`,
    }),

    notFound: ctx => ({
      title: "Page not found",
      desc: "The page you are looking for is not here.",
      body: `
<div class="wrap err">
  <div>
    <span class="big">404</span>
    <h1>This page <em class="wave">flew away.</em></h1>
    <p class="lede">The address may be wrong, or the page may have moved. Carry on from the <a href="/en/">home page</a>.</p>
  </div>
  <img src="/assets/img/pose-error.webp" alt="A startled Ebabil" width="512" height="511">
</div>`,
    }),
  },
};

// Sitedeki sabit dizgeler
export const ui = {
  tr: {
    nav: [["/esin/", "Esin", "esin"], ["/gizlilik/", "Gizlilik", "privacy"], ["/surum-notlari/", "Sürüm notları", "notes"], ["/indir/", "İndir", "download"]],
    langName: "EN", langTitle: "Switch to English", skip: "İçeriğe geç",
    footTag: "Vento, pre-alpha.",
    footLine: "Can Soykan Yılmaz yapıyor. Çerez yok, analitik yok, dış istek yok.",
    home: "Vento ana sayfa",
  },
  en: {
    nav: [["/en/esin/", "Esin", "esin"], ["/en/privacy/", "Privacy", "privacy"], ["/en/release-notes/", "Release notes", "notes"], ["/en/download/", "Download", "download"]],
    langName: "TR", langTitle: "Türkçe'ye geç", skip: "Skip to content",
    footTag: "Vento, pre-alpha.",
    footLine: "Made by Can Soykan Yılmaz. No cookies, no analytics, no outside requests.",
    home: "Vento home",
  },
};

export const routes = {
  tr: { home: "/", download: "/indir/", esin: "/esin/", privacy: "/gizlilik/", notes: "/surum-notlari/" },
  en: { home: "/en/", download: "/en/download/", esin: "/en/esin/", privacy: "/en/privacy/", notes: "/en/release-notes/" },
};
