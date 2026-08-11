#!/usr/bin/env python3
"""Akif CPG — iki PDF üretir: sade tanıtım ve kullanım kılavuzu."""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

SUP = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("Body", SUP + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Body-B", SUP + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Body-I", SUP + "Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Head", SUP + "Georgia.ttf"))
pdfmetrics.registerFont(TTFont("Head-B", SUP + "Georgia Bold.ttf"))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-B", italic="Body-I")

INK = colors.HexColor("#16202b")
MUTED = colors.HexColor("#5a6b7d")
ACCENT = colors.HexColor("#1d5fbf")
ACCENT_SOFT = colors.HexColor("#eaf1fb")
LINE = colors.HexColor("#d8dee6")
GOOD = colors.HexColor("#1f8a5d")
GOOD_SOFT = colors.HexColor("#e9f5ef")
WARN_SOFT = colors.HexColor("#fbf3e2")
BAD = colors.HexColor("#c0392b")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm

S = {
    "title": ParagraphStyle("title", fontName="Head-B", fontSize=26, leading=31, textColor=INK, spaceAfter=4),
    "subtitle": ParagraphStyle("subtitle", fontName="Body", fontSize=11.5, leading=16, textColor=MUTED, spaceAfter=2),
    "kicker": ParagraphStyle("kicker", fontName="Body-B", fontSize=8, leading=12, textColor=ACCENT, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Head-B", fontSize=15, leading=20, textColor=INK, spaceBefore=16, spaceAfter=6),
    "h3": ParagraphStyle("h3", fontName="Body-B", fontSize=10.5, leading=14, textColor=INK, spaceBefore=9, spaceAfter=3),
    "body": ParagraphStyle("body", fontName="Body", fontSize=10, leading=15.5, textColor=INK, spaceAfter=7, alignment=TA_LEFT),
    "lead": ParagraphStyle("lead", fontName="Body", fontSize=11, leading=17, textColor=MUTED, spaceAfter=10),
    "bullet": ParagraphStyle("bullet", fontName="Body", fontSize=10, leading=15, textColor=INK,
                             leftIndent=12, bulletIndent=2, spaceAfter=4),
    "small": ParagraphStyle("small", fontName="Body", fontSize=8.5, leading=12.5, textColor=MUTED, spaceAfter=6),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=9, leading=13, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Body-B", fontSize=9, leading=13, textColor=INK),
    "cellm": ParagraphStyle("cellm", fontName="Body", fontSize=9, leading=13, textColor=MUTED),
    "note": ParagraphStyle("note", fontName="Body", fontSize=9.5, leading=14.5, textColor=INK),
}


class Rule(Flowable):
    def __init__(self, width, thickness=0.6, color=LINE, space=6):
        Flowable.__init__(self)
        self.width, self.thickness, self.color, self.space = width, thickness, color, space
        self.height = space

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


class StackedBar(Flowable):
    """Yatay yığılmış bar: [(etiket, yüzde, renk), ...]"""

    def __init__(self, width, slices, height=17):
        Flowable.__init__(self)
        self.width, self.slices, self.height = width, slices, height

    def draw(self):
        x = 0
        for _label, pct, color in self.slices:
            w = self.width * pct / 100.0
            self.canv.setFillColor(color)
            self.canv.rect(x, 0, w, self.height, stroke=0, fill=1)
            x += w


def callout(text, bg=ACCENT_SOFT, width=None, style="note"):
    t = Table([[Paragraph(text, S[style])]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def data_table(rows, col_widths, header=True, align_right=None):
    align_right = align_right or []
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f5f9")),
            ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ]
    for c in align_right:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def bullets(items, style="bullet"):
    return [Paragraph(i, S[style], bulletText="•") for i in items]


class Doc(BaseDocTemplate):
    def __init__(self, filename, doc_title, **kw):
        BaseDocTemplate.__init__(self, filename, pagesize=A4,
                                 leftMargin=MARGIN, rightMargin=MARGIN,
                                 topMargin=MARGIN + 6 * mm, bottomMargin=MARGIN,
                                 title=doc_title, author="Akif CPG", **kw)
        self.doc_title = doc_title
        frame = Frame(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 6 * mm, id="main")
        self.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=self._decorate)])

    def _decorate(self, canv, doc):
        canv.saveState()
        if doc.page > 1:
            canv.setFont("Body", 7.5)
            canv.setFillColor(MUTED)
            canv.drawString(MARGIN, PAGE_H - MARGIN - 3 * mm, self.doc_title)
            canv.setStrokeColor(LINE)
            canv.setLineWidth(0.5)
            canv.line(MARGIN, PAGE_H - MARGIN - 5 * mm, PAGE_W - MARGIN, PAGE_H - MARGIN - 5 * mm)
        canv.setFont("Body", 7.5)
        canv.setFillColor(MUTED)
        canv.drawRightString(PAGE_W - MARGIN, MARGIN - 5 * mm, "Sayfa %d" % doc.page)
        canv.drawString(MARGIN, MARGIN - 5 * mm, "Akif CPG — Pricing Architect")
        canv.restoreState()


CW = PAGE_W - 2 * MARGIN


def cover(story, kicker, title, subtitle):
    story.append(Paragraph(kicker, S["kicker"]))
    story.append(Paragraph(title, S["title"]))
    story.append(Paragraph(subtitle, S["subtitle"]))
    story.append(Spacer(1, 4))
    story.append(Rule(CW, thickness=1.4, color=INK, space=14))


# ─────────────────────────────────────────────────────────────
# PDF 1 — Ne işe yarar
# ─────────────────────────────────────────────────────────────
def build_intro(path):
    doc = Doc(path, "Akif CPG — Bu program ne işe yarıyor?")
    st = []
    cover(st, "SADE ANLATIM · 12 AĞUSTOS 2026",
          "Bu program ne işe yarıyor?",
          "Akif CPG — Pricing Architect. Teknik bilgi gerekmez; baştan sona okuması 5 dakika.")

    st.append(Paragraph("Tek cümleyle", S["h2"]))
    st.append(Paragraph(
        "Bir ürünü rafta sattığında <b>cebine gerçekte ne kalacağını</b>, daha ürünü üretmeden "
        "önce gösteren bir hesap programı.", S["lead"]))

    st.append(Paragraph("Önce problemi anlatalım", S["h2"]))
    st.append(Paragraph(
        "Diyelim bir çikolata kutusu ürettin. Markette 20 dolara satılıyor. İnsanın aklına ilk gelen "
        "şey şu olur: “20 dolar bana geliyor, maliyetim 4 dolar, demek 16 dolar kâr.”", S["body"]))
    st.append(Paragraph(
        "Gerçek hiç öyle değil. Fabrikandan markete kadar aradaki <b>herkes bir pay alıyor</b>: market "
        "kendi kârını koyuyor, dağıtıcı kendi kârını koyuyor, nakliye ve gümrük var, indirim "
        "kampanyaları var, aracıya komisyon var, iade ve kesintiler var. Sana kalan, tahmin ettiğinin "
        "çok altında oluyor.", S["body"]))

    st.append(Paragraph("Gerçek bir örnek: 20 dolarlık ürün", S["h2"]))
    st.append(Paragraph(
        "Aşağıdaki dağılım programın kendi hesabından alındı. Tüketicinin ödediği 19,99 dolar "
        "şu şekilde bölüşülüyor:", S["body"]))

    slices = [
        ("Market", 48.0, colors.HexColor("#0ea5e9")),
        ("Dağıtıcı", 9.9, colors.HexColor("#06b6d4")),
        ("Promosyon", 4.8, colors.HexColor("#8b5cf6")),
        ("Kesintiler", 0.8, colors.HexColor("#d946ef")),
        ("Aracı", 2.1, colors.HexColor("#fb7185")),
        ("Lojistik", 6.4, colors.HexColor("#f59e0b")),
        ("Üretim", 18.3, colors.HexColor("#78716c")),
        ("Üretici kârı", 4.6, colors.HexColor("#a8a29e")),
        ("Sana kalan", 5.0, colors.HexColor("#10b981")),
    ]
    st.append(StackedBar(CW, slices))
    st.append(Spacer(1, 10))

    rows = [[Paragraph("Kime gidiyor", S["cellb"]), Paragraph("Tutar", S["cellb"]), Paragraph("Pay", S["cellb"])]]
    money = [("Market (raf kârı)", "9,60 $", "%48"), ("Dağıtıcı", "1,98 $", "%9,9"),
             ("Promosyon / indirimler", "0,97 $", "%4,8"), ("Kesintiler, iadeler", "0,17 $", "%0,8"),
             ("Aracı komisyonu ve değişken giderler", "0,42 $", "%2,1"),
             ("Nakliye, gümrük, depo", "1,28 $", "%6,4"),
             ("Ürünün üretim maliyeti", "3,65 $", "%18,3"),
             ("Üreticinin kârı", "0,91 $", "%4,6")]
    for label, amount, pct in money:
        rows.append([Paragraph(label, S["cell"]), Paragraph(amount, S["cell"]), Paragraph(pct, S["cellm"])])
    rows.append([Paragraph("<b>Sana kalan (katkı payı)</b>", S["cellb"]),
                 Paragraph("<b>1,01 $</b>", S["cellb"]), Paragraph("<b>%5</b>", S["cellb"])])
    st.append(data_table(rows, [CW * 0.62, CW * 0.19, CW * 0.19], align_right=[1, 2]))
    st.append(Spacer(1, 10))
    st.append(callout(
        "20 dolarlık üründen cebe giren <b>1 dolar</b>. Bunu önceden bilmezsen, “iyi anlaşma” "
        "sandığın şey aslında zarar olabilir. Programın yaptığı iş tam olarak bu tabloyu, sen daha "
        "anlaşmayı imzalamadan önce göstermek.", GOOD_SOFT, CW))

    st.append(Paragraph("İnsanların en çok yanıldığı üç konu", S["h2"]))

    st.append(Paragraph("1. “Yüzde 20 kâr” dediğinde ne kastediyorsun?", S["h3"]))
    st.append(Paragraph(
        "İki farklı hesap var ve ikisi de “%20” diye anılıyor: maliyetin üstüne %20 eklemek, ya da "
        "satış fiyatının %20’si kâr kalacak şekilde fiyatlamak. 8 dolarlık bir üründe ilki "
        "<b>9,60 dolar</b>, ikincisi <b>10,00 dolar</b> eder. Aynı cümle, farklı fiyat. Karşı taraf "
        "birini, sen diğerini kastedersen anlaşma yanlış kurulur. Program her yerde hangisini "
        "kastettiğini <b>açıkça sorar</b> ve asla ikisini karıştırmaz.", S["body"]))

    st.append(Paragraph("2. Promosyonlar sandığından pahalı", S["h3"]))
    st.append(Paragraph(
        "“Yılda birkaç kez indirim yaparız” cümlesi masum görünür. Ama 4 hafta 2 alana 1 bedava, "
        "8 hafta %15 indirim yaptığında bu, yıllık cironun <b>yaklaşık %9,5’i</b> demek. Üstüne "
        "plansız indirimler eklenince %12–15’i bulur. Program bunu promosyon takviminden tek tek "
        "hesaplar; “gözümüzle %10 diyelim” demez.", S["body"]))

    st.append(Paragraph("3. Herkesin zinciri farklı", S["h3"]))
    st.append(Paragraph(
        "Kimi markete doğrudan satar, kimi dağıtıcı üzerinden gider, kimi marketin kendi markasını "
        "üretir. Zincir değişince hesap tamamen değişir. Program hangi yapıda çalıştığını başta "
        "sorar ve <b>gereksiz alanları ekrandan kaldırır</b>.", S["body"]))

    st.append(Paragraph("Program iki soruya cevap veriyor", S["h2"]))
    q = [[Paragraph("<b>Soru 1 — Aşağıdan yukarı</b><br/><br/>“Maliyetim 3,65 dolar. "
                    "Herkes payını aldıktan sonra <b>raf fiyatı kaç olmalı</b> ki hedeflediğim kâr kalsın?”"
                    "<br/><br/><font color='#1d5fbf'><b>Cevap: 18,69 dolar.</b></font>", S["cell"]),
          Paragraph("<b>Soru 2 — Yukarıdan aşağı</b><br/><br/>“Market bu ürünü 17,99 dolardan satacak. "
                    "O zaman <b>maliyetim en fazla kaç olabilir</b>?”"
                    "<br/><br/><font color='#1d5fbf'><b>Cevap: 6,27 dolar.</b></font>", S["cell"])]]
    t = Table(q, colWidths=[CW / 2 - 4, CW / 2 - 4])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f9fc")),
        ("BOX", (0, 0), (0, 0), 0.6, LINE), ("BOX", (1, 0), (1, 0), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 11), ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    st.append(t)
    st.append(Spacer(1, 8))
    st.append(Paragraph(
        "İkinci soru pazarlıkta altın değerinde. Tedarikçin sana fiyat verirken “en fazla şu kadar "
        "ödeyebilirim” diyebilmek, ya da market “fiyatı 15,99’a çekelim” dediğinde bunun mümkün olup "
        "olmadığını <b>oracıkta</b> görebilmek demek.", S["body"]))

    st.append(Paragraph("Ne kazandırıyor?", S["h2"]))
    for b in bullets([
        "<b>Beş dakikada karar.</b> Excel’de yarım gün süren hesap, birkaç kutuya yazıp bitiyor.",
        "<b>Pazarlık sınırını bilirsin.</b> Nereye kadar inebileceğini bilerek masaya oturursun.",
        "<b>“Neyi değiştirsem?” sorusuna sayısal cevap.</b> Program sana beş seçenek verir: fiyatı "
        "şu kadar artır, ya da maliyeti şu kadar düşür, ya da promosyonu şuraya çek… Her birinin "
        "tam rakamıyla.",
        "<b>Kara kutu değil.</b> Her sayının yanındaki simgeye basınca formülü, girdileri ve ara "
        "adımları gösteriyor. İstersen kalem kâğıtla doğrulayabilirsin.",
        "<b>Senaryoları karşılaştırırsın.</b> “Market bunu isterse”, “dağıtıcıyla gidersek”, "
        "“doğrudan satarsak” — hepsini kaydedip yan yana koyabilirsin.",
        "<b>Hata yakalar.</b> Katkı eksiye düşerse, promosyon haftaları çakışırsa, ithalat "
        "maliyeti boş kaldıysa uyarır.",
    ]):
        st.append(b)

    st.append(Paragraph("Kimin işine yarar?", S["h2"]))
    rows = [[Paragraph("Kim", S["cellb"]), Paragraph("Ne için kullanır", S["cellb"])]]
    for who, why in [
        ("Marka sahibi", "Ürünü rafa koymadan önce kâr edip etmeyeceğini görmek, market ve dağıtıcıyla pazarlığa hazırlanmak."),
        ("Üretici", "Müşterisine vereceği fiyat teklifinin, müşterinin kendi rafında tutup tutmayacağını kontrol etmek."),
        ("İhracatçı", "Navlun, gümrük ve tarifeyi hesaba katıp hedef ülkedeki raf fiyatını görmek."),
        ("Private label üreticisi", "Marketin kendi markası için verilen fiyatın maliyeti karşılayıp karşılamadığını ölçmek."),
        ("Danışman / broker", "Farklı müşteriler için senaryoları hızlıca kurup karşılaştırmak."),
    ]:
        rows.append([Paragraph(who, S["cellb"]), Paragraph(why, S["cell"])])
    st.append(data_table(rows, [CW * 0.26, CW * 0.74]))

    st.append(Paragraph("Kısaca", S["h2"]))
    st.append(callout(
        "Bu program, ürününü rafa götüren yoldaki <b>her elin ne kadar aldığını</b> ve sana ne "
        "kaldığını gösteriyor. Sonra da tersini yapıyor: istediğin kârı korumak için fiyatın ne "
        "olması, ya da maliyetinin en fazla ne olması gerektiğini söylüyor. Gerisi senin ticari "
        "kararın — ama artık rakamı bilerek veriyorsun.", ACCENT_SOFT, CW))

    doc.build(st)
    return path


# ─────────────────────────────────────────────────────────────
# PDF 2 — Kullanım kılavuzu
# ─────────────────────────────────────────────────────────────
def build_guide(path):
    doc = Doc(path, "Akif CPG — Kullanım Kılavuzu")
    st = []
    cover(st, "KULLANIM KILAVUZU · 12 AĞUSTOS 2026",
          "Akif CPG — Kullanım Kılavuzu",
          "Programı açmaktan ürün eklemeye, senaryo karşılaştırmaktan dışa aktarmaya kadar "
          "adım adım. Ekrandaki yazılar İngilizce olduğu için düğme adlarını olduğu gibi verdim.")

    # 1
    st.append(Paragraph("1. Programı açmak", S["h2"]))
    st.append(Paragraph("İki yolu var, ikisi de aynı programı açar.", S["body"]))
    rows = [[Paragraph("Yol", S["cellb"]), Paragraph("Nasıl", S["cellb"]), Paragraph("Ne zaman", S["cellb"])]]
    for a, b, c in [
        ("Çift tıkla", "Proje klasöründeki <b>Akif-CPG-Baslat.command</b> dosyasına çift tıkla. "
                       "Tarayıcı kendi açılır.", "Günlük kullanım. Terminal bilmene gerek yok."),
        ("Terminalden", "Proje klasöründe <b>npm run dev</b> yaz, sonra tarayıcıda "
                        "<b>localhost:3000</b> adresine git.", "Kodda değişiklik yaptığında."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"]), Paragraph(c, S["cellm"])])
    st.append(data_table(rows, [CW * 0.16, CW * 0.48, CW * 0.36]))
    st.append(Spacer(1, 8))
    st.append(callout(
        "<b>Verilerin nerede duruyor?</b> Girdiğin her şey kendi tarayıcının hafızasında saklanıyor. "
        "Yani sunucuya, buluta bir şey gitmiyor. Aynı tarayıcıdan girdiğinde her şey yerinde durur; "
        "başka bilgisayardan girdiğinde boş başlar. Tarayıcı geçmişini/site verilerini temizlersen "
        "kayıtlar da silinir — önemli çalışmaları <b>Export</b> ile dışarı al.", WARN_SOFT, CW))

    # 2
    st.append(Paragraph("2. Ekranın haritası", S["h2"]))
    st.append(Paragraph("Ana ekran dört bölgeden oluşur:", S["body"]))
    rows = [[Paragraph("Bölge", S["cellb"]), Paragraph("Ne var", S["cellb"])]]
    for a, b in [
        ("Üst bar", "Ürün seçici, <b>New product</b> (yeni ürün), <b>Portfolio</b> (tüm ürünler), "
                    "müşteri profilleri, senaryo seçici ve işlem düğmeleri: Reset, Save, Duplicate, "
                    "Compare, History, Export."),
        ("Özet kartları", "Yedi başlık rakamı: hedef raf fiyatı, hesaplanan raf fiyatı, marka fatura "
                          "fiyatı, landed maliyet, promosyon oranı, market marjı ve katkı marjı. "
                          "Altında tek cümlelik hüküm ve fiyat açığı."),
        ("Sol panel", "Düzenlediğin bütün varsayımlar. Bölüm bölüm açılıp kapanır."),
        ("Orta panel", "Dört sekme: <b>Price build</b>, <b>$ allocation</b>, <b>Sensitivity</b>, "
                       "<b>Reverse &amp; fix</b>."),
        ("Sağ panel", "<b>Commercial Advisor</b> — modeli sürekli izleyip sayısal uyarı ve fırsat "
                      "çıkarır. Altında model kontrol uyarıları."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.19, CW * 0.81]))

    st.append(Paragraph("Renkler ne anlama geliyor?", S["h3"]))
    rows = [[Paragraph("Renk", S["cellb"]), Paragraph("Anlamı", S["cellb"])]]
    for a, b in [
        ("Mavi kutu", "Sen değiştirebilirsin — yazı yazılabilen alan."),
        ("Gri yazı", "Program hesapladı — elle değiştirilemez."),
        ("Yeşil", "Sağlıklı; hedefin üstünde."),
        ("Sarı", "Gözden geçir; hedefin altında ama zarar değil."),
        ("Kırmızı", "Sorun; zarar ya da imkânsız fiyat."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.19, CW * 0.81]))
    st.append(Spacer(1, 6))
    st.append(Paragraph(
        "Bir de hesaplanan sayıların yanında küçük bir <b>bilgi simgesi</b> var. Üzerine gelince "
        "formülü gösterir, tıklayınca girdileri ve ara adımları tek tek açar. Bir sayıya "
        "güvenmediğinde ilk oraya bak.", S["body"]))

    # 3
    st.append(Paragraph("3. İlk ürününü ekle", S["h2"]))
    st.append(Paragraph(
        "Üst bardaki <b>New product</b> düğmesine bas. Beş adımlı bir sihirbaz açılır. Acelen varsa "
        "ilk adımda <b>Skip guided setup</b> ile soruları atlayabilirsin.", S["body"]))
    rows = [[Paragraph("Adım", S["cellb"]), Paragraph("Ne yapıyorsun", S["cellb"])]]
    for a, b in [
        ("1 — Business", "Beş soru: şirketin ne yapıyor, ürünü kim üretiyor, kim ithal ediyor, nasıl "
                         "satıyorsun, hangi kanallarda. Program bunlardan bir <b>öneri</b> çıkarır."),
        ("2 — Structure &amp; route", "İş yapını ve satış zincirini onaylarsın. Önerilen seçeneklerde "
                                      "“suggested” etiketi olur ama son söz senin. Zincir seçimin "
                                      "ekrandaki alanları belirler: doğrudan satıyorsan dağıtıcı "
                                      "alanları hiç görünmez."),
        ("3 — Product basics", "Ürün adı ve SKU zorunlu; markası, kategorisi, ambalajı, üretim ülkesi, "
                               "para birimi, hedef pazar ve raf fiyatları isteğe bağlı."),
        ("4 — COGS", "Üretim maliyeti. <b>Simple</b>: tek rakam yaz. <b>Detailed</b>: hammadde, ambalaj "
                     "ve üretim kalemlerini tek tek gir, program toplasın."),
        ("5 — Review", "Özet ve <b>model kontrolü</b>. Program ürünü fiyatlayabiliyorsa yeşil kutuda "
                       "gerekli raf fiyatını gösterir; fiyatlayamıyorsa <b>Create product</b> kilitli kalır."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.24, CW * 0.76]))

    # 4
    st.append(Paragraph("4. Varsayımları düzenlemek (sol panel)", S["h2"]))
    st.append(Paragraph(
        "Her bölüm ayrı açılır. Yazdığın anda ekran yeniden hesaplanır — “Hesapla” düğmesi yok.", S["body"]))
    rows = [[Paragraph("Bölüm", S["cellb"]), Paragraph("İçinde ne var", S["cellb"])]]
    for a, b in [
        ("Manufacturing", "Üretim maliyeti ve üreticinin kâr oranı. <b>Basis</b> kutusundan “margin” mi "
                          "“markup” mı olduğunu seçersin — ikisi farklı fiyat verir."),
        ("Landed cost", "Uluslararası navlun, gümrük tarifesi (yüzdesi neyin üstünden alınıyorsa onu "
                        "seçersin) ve yurt içi nakliye."),
        ("Commercial", "Aracı komisyonu ve kesintiler (iade, hasar, erken ödeme indirimi gibi)."),
        ("Distributor", "Dağıtıcı marjı ve birim başı hizmet bedeli. Zincirinde dağıtıcı yoksa bu "
                        "bölüm hiç görünmez."),
        ("Retailer", "Marketin marjı. Yine margin/markup seçimi var."),
        ("Promotions &amp; trade spend", "İki mod: elle yüzde yazmak, ya da <b>promosyon takvimi</b> "
                                         "kurup programın hesaplaması. Üstüne bir de plansız indirimler "
                                         "için yedek pay ekleyebilirsin."),
        ("Shelf price &amp; target", "Korumak istediğin kâr oranı, bugünkü raf fiyatı ve hedef raf fiyatı."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.28, CW * 0.72]))

    # 5
    st.append(Paragraph("5. Sonuçları okumak — dört sekme", S["h2"]))

    st.append(Paragraph("Price build — fiyat nasıl oluşuyor", S["h3"]))
    st.append(Paragraph(
        "Üretim maliyetinden raf fiyatına kadar her kademe alt alta. Her satırda o kademede ne "
        "eklendiğini görürsün. Sağ altta ayrıca net gelir ve katkı payı yazar.", S["body"]))

    st.append(Paragraph("$ allocation — para nereye gidiyor", S["h3"]))
    st.append(Paragraph(
        "Tüketicinin ödediği paranın kim tarafından ne kadarının alındığı. Toplantıda göstermek için "
        "en anlaşılır ekran budur.", S["body"]))

    st.append(Paragraph("Sensitivity — “ya şöyle olursa?”", S["h3"]))
    st.append(Paragraph(
        "Bir değişkeni (promosyon oranı, market marjı, dağıtıcı marjı) kademe kademe değiştirip her "
        "birinde ne olduğunu tablo ve grafikte gösterir. Alttaki matris ise <b>iki</b> değişkeni aynı "
        "anda oynatır: satırlarda biri, sütunlarda diğeri, hücrelerde sonuç. Test noktalarını "
        "istediğin gibi değiştirebilirsin.", S["body"]))

    st.append(Paragraph("Reverse &amp; fix — geriye doğru hesap ve çözüm", S["h3"]))
    st.append(Paragraph(
        "Üstte hedef raf fiyatını yazarsın, program geriye doğru iner ve <b>en fazla ne kadar "
        "maliyete katlanabileceğini</b> söyler. Altında fiyat açığı: mevcut maliyetin bu fiyatın "
        "altında mı üstünde mi. Model hedefin altındaysa burada <b>Improve economics</b> bölümü açılır "
        "ve beş çözüm sıralar; uygulanabilir olanların yanında düğme vardır, bir tıkla varsayımı "
        "değiştirir.", S["body"]))

    # 6
    st.append(Paragraph("6. Commercial Advisor (sağ panel)", S["h2"]))
    st.append(Paragraph(
        "Program modeli sürekli izler ve üç seviyede uyarı üretir:", S["body"]))
    for b in bullets([
        "<b>Critical (kırmızı):</b> zarar ediyorsun, hedef imkânsız, ya da fiyat başabaşın altında.",
        "<b>Warning (sarı):</b> kâr çok ince, promosyon yükü ağır, hedefle hesaplanan fiyat çok ayrışmış.",
        "<b>Opportunity (yeşil):</b> şunu değiştirirsen şu kadar kazanırsın.",
    ]):
        st.append(b)
    st.append(Paragraph(
        "Her kartta <b>Explain</b> (arkasındaki rakamları göster) ve <b>Ignore</b> (bu kartı gizle) "
        "var. Önemli nokta: <b>Advisor hiçbir şeyi kendiliğinden değiştirmez</b>. Sadece söyler; "
        "uygulamak senin kararın.", S["body"]))

    # 7
    st.append(Paragraph("7. Promosyon planlayıcı", S["h2"]))
    st.append(Paragraph(
        "Promosyon bölümünde <b>Promotional calendar</b> modunu seçip planlayıcıyı aç. Her promosyon "
        "için: adı, türü (2 alana 1 bedava, fatura indirimi, raf indirimi, katalog reklamı…), kaç "
        "hafta süreceği, indirim oranı, satışın ne kadar artmasını beklediğin ve <b>bu indirimin "
        "yüzde kaçını senin ödediğin</b>. Sabit etkinlik bedeli varsa onu da girersin.", S["body"]))
    st.append(Paragraph(
        "Alt kısımda plan anında hesaplanır: promosyon başına döküm, toplam oran ve o oranın hangi "
        "aralığa denk geldiği. Bir de para cinsinden karşılığını gösterir: “1.000.000 dolar ciroda "
        "bu, 114.800 dolar promosyon gideri demek.” Beğenirsen <b>Apply to model</b> ile modele "
        "işlersin — o ana kadar hiçbir şey değişmez.", S["body"]))

    # 8
    st.append(Paragraph("8. Senaryolar: kaydet, kopyala, karşılaştır", S["h2"]))
    rows = [[Paragraph("Düğme", S["cellb"]), Paragraph("Ne yapar", S["cellb"])]]
    for a, b in [
        ("Save", "Şu anki varsayımları açık senaryoya kaydeder ve <b>neyin değiştiğini geçmişe yazar</b>."),
        ("Duplicate", "Mevcut haliyle yeni bir senaryo oluşturur. İsim önerileri hazır gelir: "
                      "Base, Conservative, Target, Retailer Request…"),
        ("Compare", "Aynı ürünün senaryolarını yan yana koyar; her sütun canlı hesaplanır."),
        ("History", "Bu senaryoda hangi kayıtta neyin değiştiği: “Market marjı %48 → %50”, "
                    "“Gerekli raf fiyatı 18,69 $ → 19,44 $” gibi."),
        ("Reset", "Kaydedilmemiş değişiklikleri atar, en son kaydedilen hale döner."),
    ]:
        rows.append([Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.17, CW * 0.83]))
    st.append(Spacer(1, 6))
    st.append(callout(
        "Senaryo seçicinin yanında <b>sarı bir nokta</b> görüyorsan, kaydedilmemiş değişikliğin var "
        "demektir. Kapatmadan önce <b>Save</b>’e bas.", WARN_SOFT, CW))

    # 9
    st.append(Paragraph("9. Müşteri profilleri", S["h2"]))
    st.append(Paragraph(
        "Aynı marketin şartlarını her ürün için baştan yazmamak için <b>Profiles</b> düğmesinden "
        "profil oluşturursun. Market profilinde: marjı, komisyon, kesintiler, ödeme vadesi ve "
        "<b>hangi dağıtıcıyla çalıştığı</b>. Dağıtıcı profilinde: marj ve hizmet bedeli.", S["body"]))
    st.append(Paragraph(
        "Sonra üst bardan o marketi seçtiğinde bütün şartları modele işlenir; dağıtıcısı da otomatik "
        "gelir. Bir markete doğrudan satıyorsan “Direct” seçersin, dağıtıcı zincirden çıkar.", S["body"]))

    # 10
    st.append(Paragraph("10. Portföy ekranı", S["h2"]))
    st.append(Paragraph(
        "Üst bardaki <b>Portfolio</b> tüm ürünlerini tek tabloda gösterir: maliyet, landed, fatura, "
        "marjlar, gerekli raf fiyatı, katkı ve <b>durum ışığı</b> (yeşil sağlıklı, sarı gözden geçir, "
        "kırmızı eşiğin altında). Eşikleri sağ üstten kendin ayarlarsın. Bir satıra tıklayınca o "
        "ürün fiyatlama ekranında açılır.", S["body"]))

    # 11
    st.append(Paragraph("11. Dışa aktarma", S["h2"]))
    st.append(Paragraph(
        "<b>Export</b> düğmesi senaryoyu CSV olarak indirir; Excel doğrudan açar. İçinde bütün "
        "varsayımlar, fiyat kademeleri, promosyonlar, promosyon oranı, sonuçlar ve duyarlılık "
        "tablosu vardır. Toplantıya götürmek ya da yedek almak için en pratik yol budur.", S["body"]))

    # 12
    st.append(Paragraph("12. Sık yapılan işler", S["h2"]))
    rows = [[Paragraph("İstediğin", S["cellb"]), Paragraph("Yapman gereken", S["cellb"])]]
    for a, b in [
        ("Bu fiyattan satsam kâr eder miyim?",
         "Shelf price bölümüne bugünkü raf fiyatını yaz, özet kartlarındaki <b>Contribution margin</b>’e bak."),
        ("Maliyetim en fazla kaç olabilir?",
         "<b>Reverse &amp; fix</b> sekmesi, hedef raf fiyatını yaz."),
        ("Hedefi tutturamıyorum, ne yapayım?",
         "<b>Reverse &amp; fix</b> → <b>Improve economics</b>; beş çözümden birini seç."),
        ("Market %52 marj istiyor, dayanır mı?",
         "Retailer bölümünde oranı değiştir, ya da <b>Sensitivity</b> matrisinde tüm ihtimalleri gör."),
        ("Promosyon planım ne kadara mal olur?",
         "Promosyon planlayıcıda takvimi kur, alttaki toplam orana ve dolar karşılığına bak."),
        ("İki seçeneği karşılaştırmak istiyorum",
         "Birini kaydet, <b>Duplicate</b> ile ikinciyi kur, <b>Compare</b>’e bas."),
        ("Bu sayı nereden çıktı?",
         "Sayının yanındaki bilgi simgesine tıkla; formül, girdiler ve ara adımlar açılır."),
        ("Yedek almak istiyorum",
         "<b>Export</b> ile CSV indir."),
    ]:
        rows.append([Paragraph(a, S["cell"]), Paragraph(b, S["cell"])])
    st.append(data_table(rows, [CW * 0.40, CW * 0.60]))

    st.append(Paragraph("Son bir hatırlatma", S["h2"]))
    st.append(callout(
        "Program bir <b>hesap makinesi ve kontrol aracı</b>; ticari kararı senin yerine vermez. "
        "Verdiği aralıklar ve öneriler planlama içindir, garanti değildir. Rakamların doğruluğu "
        "girdiğin varsayımların doğruluğu kadardır — maliyeti yanlış girersen sonuç da yanlış çıkar.",
        ACCENT_SOFT, CW))

    doc.build(st)
    return path


if __name__ == "__main__":
    import os
    base = "/Users/yahyakancal/Documents/Akif-CPG/docs"
    os.makedirs(base, exist_ok=True)
    p1 = build_intro(os.path.join(base, "Akif-CPG-Ne-Ise-Yarar.pdf"))
    p2 = build_guide(os.path.join(base, "Akif-CPG-Kullanim-Kilavuzu.pdf"))
    for p in (p1, p2):
        print(p, os.path.getsize(p), "bytes")
