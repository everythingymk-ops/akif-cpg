#!/usr/bin/env python3
"""Akif CPG — "Godiva Sticks örneğiyle" yatay (landscape) kullanım rehberi.

Ekran görüntüleri gerçek uygulamadan alınır (docs/guide-shots/), rakamlar da
modelin kendi çıktısıdır — bu dosyada elle hesaplanmış tek bir sayı yoktur.
Yeniden üretmek için: python3 docs/make-example-guide.py
"""

import os

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
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
pdfmetrics.registerFont(TTFont("Mono", "/System/Library/Fonts/Menlo.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("Mono-B", "/System/Library/Fonts/Menlo.ttc", subfontIndex=1))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-B", italic="Body-I")
pdfmetrics.registerFontFamily("Mono", normal="Mono", bold="Mono-B")

# Uygulamanın kendi token paleti (app/globals.css) — belge ürünle aynı dili konuşsun.
INK = colors.HexColor("#0c0e0d")
MUTED = colors.HexColor("#55605b")
FAINT = colors.HexColor("#8b958f")
ACCENT = colors.HexColor("#225241")
ACCENT_SOFT = colors.HexColor("#e9f2ee")
HAIR = colors.HexColor("#e1e5e3")
TINT = colors.HexColor("#f4f7f5")
POS = colors.HexColor("#056c4a")
POS_SOFT = colors.HexColor("#e9faf1")
WARN = colors.HexColor("#8a5600")
WARN_SOFT = colors.HexColor("#fff7e3")
NEG = colors.HexColor("#cc272b")
NEG_SOFT = colors.HexColor("#fff1f0")
EDIT = colors.HexColor("#1453af")
EDIT_SOFT = colors.HexColor("#f3f8fe")

PAGE_W, PAGE_H = landscape(A4)
M_X, M_TOP, M_BOT = 14 * mm, 13 * mm, 14 * mm
CW = PAGE_W - 2 * M_X
CH = PAGE_H - M_TOP - M_BOT
RAIL = 86 * mm
GAP = 7 * mm
PLATE = CW - RAIL - GAP

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guide-shots")

S = {
    "cover_kicker": ParagraphStyle("ck", fontName="Body-B", fontSize=8.5, leading=12,
                                   textColor=ACCENT, spaceAfter=10),
    "cover_title": ParagraphStyle("ct", fontName="Head-B", fontSize=34, leading=39,
                                  textColor=INK, spaceAfter=8),
    "cover_sub": ParagraphStyle("cs", fontName="Body", fontSize=12, leading=18,
                                textColor=MUTED, spaceAfter=6),
    "eyebrow": ParagraphStyle("eb", fontName="Body-B", fontSize=7.5, leading=10.5,
                              textColor=ACCENT, spaceAfter=4),
    "h1": ParagraphStyle("h1", fontName="Head-B", fontSize=17, leading=21,
                         textColor=INK, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Body-B", fontSize=9.5, leading=13,
                         textColor=INK, spaceBefore=6, spaceAfter=3),
    "body": ParagraphStyle("body", fontName="Body", fontSize=8.8, leading=13.4,
                           textColor=INK, spaceAfter=6),
    "lead": ParagraphStyle("lead", fontName="Body", fontSize=10, leading=15,
                           textColor=MUTED, spaceAfter=8),
    "small": ParagraphStyle("small", fontName="Body", fontSize=7.6, leading=11,
                            textColor=MUTED, spaceAfter=4),
    "bullet": ParagraphStyle("bl", fontName="Body", fontSize=8.8, leading=13,
                             textColor=INK, leftIndent=10, bulletIndent=1, spaceAfter=3.5),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=8, leading=11.5, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Body-B", fontSize=8, leading=11.5, textColor=INK),
    "cellm": ParagraphStyle("cellm", fontName="Body", fontSize=8, leading=11.5, textColor=MUTED),
    "num": ParagraphStyle("num", fontName="Mono", fontSize=8, leading=11.5, textColor=INK),
    "numb": ParagraphStyle("numb", fontName="Mono-B", fontSize=8.5, leading=12, textColor=INK),
    "note": ParagraphStyle("note", fontName="Body", fontSize=8.3, leading=12.4, textColor=INK),
    "caption": ParagraphStyle("cap", fontName="Body", fontSize=7.4, leading=10.5,
                              textColor=FAINT, spaceBefore=3),
}


class Rule(Flowable):
    def __init__(self, width, thickness=0.7, color=HAIR, space=7):
        Flowable.__init__(self)
        self.width, self.thickness, self.color, self.space = width, thickness, color, space
        self.height = space

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


def shot(name, max_w, max_h):
    """Ekran görüntüsünü en-boy oranını koruyarak yerleştir."""
    path = os.path.join(SHOTS, name)
    w_px, h_px = PILImage.open(path).size
    scale = min(max_w / w_px, max_h / h_px)
    return Image(path, width=w_px * scale, height=h_px * scale)


def callout(text, bg=ACCENT_SOFT, width=RAIL, border=None, style="note"):
    t = Table([[Paragraph(text, S[style])]], colWidths=[width])
    st = [
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]
    if border:
        st.append(("BOX", (0, 0), (-1, -1), 0.7, border))
    t.setStyle(TableStyle(st))
    return t


def facts(pairs, width=RAIL, title=None):
    """Modelden gelen sayıların künye bloğu."""
    rows = []
    if title:
        rows.append([Paragraph(title, S["cellb"]), ""])
    for label, value in pairs:
        rows.append([Paragraph(label, S["cellm"]), Paragraph(value, S["numb"])])
    t = Table(rows, colWidths=[width * 0.56, width * 0.44])
    st = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("BACKGROUND", (0, 0), (-1, -1), TINT),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]
    if title:
        st += [("SPAN", (0, 0), (1, 0)), ("BOTTOMPADDING", (0, 0), (1, 0), 1)]
    t.setStyle(TableStyle(st))
    return t


def table(rows, widths, align_right=(), header=True, size=8):
    t = Table(rows, colWidths=widths)
    st = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
    ]
    if header:
        st += [("BACKGROUND", (0, 0), (-1, 0), TINT), ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT)]
    for c in align_right:
        st.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(st))
    return t


def bullets(items):
    return [Paragraph(i, S["bullet"], bulletText="—") for i in items]


class Doc(BaseDocTemplate):
    def __init__(self, filename):
        BaseDocTemplate.__init__(
            self, filename, pagesize=landscape(A4),
            leftMargin=M_X, rightMargin=M_X, topMargin=M_TOP, bottomMargin=M_BOT,
            title="Akif CPG — Godiva Sticks örneğiyle kullanım rehberi", author="Akif CPG",
        )
        # Sıfır iç boşluk: tablo genişlikleri doğrudan CW ile hesaplanıyor.
        pad = dict(leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[Frame(M_X, M_BOT, CW, CH, id="c", **pad)], onPage=self._cover),
            PageTemplate(id="all", frames=[Frame(M_X, M_BOT, CW, CH, id="m", **pad)], onPage=self._chrome),
        ])
        self.section = ""

    def _cover(self, canv, doc):
        canv.saveState()
        canv.setFillColor(ACCENT)
        canv.rect(0, PAGE_H - 6 * mm, PAGE_W, 6 * mm, stroke=0, fill=1)
        canv.restoreState()

    def _chrome(self, canv, doc):
        canv.saveState()
        canv.setFillColor(ACCENT)
        canv.rect(0, PAGE_H - 3.2 * mm, PAGE_W, 3.2 * mm, stroke=0, fill=1)
        canv.setFont("Body", 7)
        canv.setFillColor(FAINT)
        canv.drawString(M_X, M_BOT - 6.5 * mm, "Akif CPG — Godiva Sticks örneği")
        canv.drawRightString(PAGE_W - M_X, M_BOT - 6.5 * mm, "%d" % doc.page)
        canv.setStrokeColor(HAIR)
        canv.setLineWidth(0.5)
        canv.line(M_X, M_BOT - 4 * mm, PAGE_W - M_X, M_BOT - 4 * mm)
        canv.restoreState()


# ── sayfa kurucuları ────────────────────────────────────────────────────────
def rail_page(story, eyebrow, title, blocks, image, caption=None, plate_h=None):
    """Sol raylı sayfa: açıklama solda, ekran görüntüsü sağda."""
    left = [Paragraph(eyebrow, S["eyebrow"]), Paragraph(title, S["h1"]), Rule(RAIL)]
    left += blocks
    right = [shot(image, PLATE, plate_h or (CH - 6 * mm))]
    if caption:
        right.append(Paragraph(caption, S["caption"]))
    t = Table([[left, right]], colWidths=[RAIL, PLATE + GAP])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), GAP), ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [t, PageBreak()]


def wide_page(story, eyebrow, title, intro, image, blocks=None, caption=None, img_h=None):
    """Tam genişlik sayfa: geniş ekran görüntüleri için."""
    story.append(Paragraph(eyebrow, S["eyebrow"]))
    story.append(Paragraph(title, S["h1"]))
    if intro:
        story.append(Paragraph(intro, S["lead"]))
    story.append(shot(image, CW, img_h or 90 * mm))
    if caption:
        story.append(Paragraph(caption, S["caption"]))
    if blocks:
        story.append(Spacer(1, 7))
        story += blocks
    story.append(PageBreak())


def build(path):
    doc = Doc(path)
    st = []

    # ── kapak ───────────────────────────────────────────────────────────────
    st.append(Spacer(1, 14 * mm))
    ident = facts([
        ("Ürün", "Godiva Sticks"),
        ("SKU", "GDV-STK-08"),
        ("Ambalaj", "88 g · 8 stick · 12'li koli"),
        ("Üretim", "Türkiye"),
        ("Pazar", "ABD · Target"),
        ("Zincir", "Route B"),
    ], width=78 * mm)
    left = [
        Paragraph("ÖRNEK ÜZERİNDEN KULLANIM REHBERİ · 12 AĞUSTOS 2026", S["cover_kicker"]),
        Paragraph("Godiva Sticks<br/>örneğiyle Akif CPG", S["cover_title"]),
        Paragraph(
            "Tek bir ürünü baştan sona modelleyip her ekranın ne işe yaradığını, hangi soruyu "
            "cevapladığını ve okunan sayının ne anlama geldiğini gösteren rehber.", S["cover_sub"]),
        Spacer(1, 6),
        Rule(150 * mm, thickness=1.2, color=INK, space=12),
        Paragraph(
            "Rehberdeki bütün ekran görüntüleri ve bütün rakamlar, bu ürün programa girildikten "
            "sonra <b>uygulamanın kendi hesabından</b> alınmıştır. Elle yazılmış tek bir sonuç "
            "sayısı yoktur.", S["body"]),
    ]
    right = [
        ident,
        Spacer(1, 8),
        callout(
            "<b>Not:</b> Godiva Sticks burada yalnızca <b>örnek bir ürün</b> olarak kullanılmıştır. "
            "Maliyet, marj ve promosyon değerleri gerçek marka verisi değil, tipik bir premium "
            "çikolata senaryosunu temsil eden varsayımlardır. Logo da yer tutucu bir görseldir.",
            WARN_SOFT, 78 * mm),
    ]
    t = Table([[left, right]], colWidths=[CW - 86 * mm, 86 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 8 * mm),
    ]))
    st.append(t)

    # Kapağın alt yarısı: içindekiler şeridi.
    st.append(Spacer(1, 16 * mm))
    st.append(Rule(CW, thickness=0.7, color=HAIR, space=10))
    toc = [
        ("Ekranın haritası", "Ana ekran · üst bar · özet kartları · varsayımlar paneli", "3–6"),
        ("Sonucu okumak", "Price build · Show Calculation · $ allocation", "7–9"),
        ("Soru sormak", "Sensitivity · senaryo matrisi · Reverse &amp; fix · Improve economics", "10–13"),
        ("Promosyon", "Planlayıcı ve planın parasal karşılığı", "14–15"),
        ("Karar ve kayıt", "Advisor · senaryolar · geçmiş · portföy · profiller", "16–20"),
        ("Yeni ürün", "Sihirbaz: künye, logo ve maliyet · kapanış", "21–23"),
    ]
    page_style = ParagraphStyle("pg", parent=S["numb"], textColor=ACCENT, fontSize=9)

    def toc_column(items):
        t = Table(
            [[Paragraph(pages, page_style), Paragraph(title, S["cellb"]), Paragraph(detail, S["cellm"])]
             for title, detail, pages in items],
            colWidths=[13 * mm, 40 * mm, CW / 2 - 59 * mm],
        )
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
        ]))
        return t

    halves = Table([[toc_column(toc[:3]), toc_column(toc[3:])]], colWidths=[CW / 2, CW / 2])
    halves.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (1, 0), 8 * mm),
        ("RIGHTPADDING", (0, 0), (0, 0), 8 * mm), ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))
    st += [halves, NextPageTemplate("all"), PageBreak()]

    # ── 1. örnek ürünün künyesi ─────────────────────────────────────────────
    st.append(Paragraph("ÖRNEĞİN GİRDİLERİ", S["eyebrow"]))
    st.append(Paragraph("Programa ne girdik?", S["h1"]))
    st.append(Paragraph(
        "Aşağıdaki üç tablo, örneğin tamamıdır. Kendi bilgisayarında birebir aynı sonuçları görmek "
        "istersen <b>New product</b> ile bu değerleri girmen yeterli — rehberdeki bütün ekranlar "
        "bu girdilerden üretildi.", S["lead"]))

    cogs_rows = [[Paragraph("Üretim maliyeti kalemi", S["cellb"]), Paragraph("$/adet", S["cellb"])]]
    for a, b in [("Çikolata ve kakao kütlesi", "0.62"), ("Dolgu ve aromalar", "0.18"),
                 ("Kutu, film, tabla", "0.34"), ("Üretim ve işçilik", "0.26"),
                 ("Kalite kontrol, fire, diğer", "0.08")]:
        cogs_rows.append([Paragraph(a, S["cell"]), Paragraph(b, S["num"])])
    cogs_rows.append([Paragraph("Toplam COGS", S["cellb"]), Paragraph("1.48", S["numb"])])

    chain_rows = [[Paragraph("Zincir varsayımı", S["cellb"]), Paragraph("Değer", S["cellb"])]]
    for a, b in [("Üretici marjı (margin)", "%22"), ("Uluslararası navlun", "$0.08/adet"),
                 ("Gümrük tarifesi", "%5,6 (gümrük değeri üzerinden)"),
                 ("Yurt içi nakliye", "$0.11/adet"), ("Aracı komisyonu", "%3"),
                 ("Kesintiler", "%1,5"), ("Distribütör marjı", "%15 + $0.04 hizmet"),
                 ("Perakendeci marjı (margin)", "%40")]:
        chain_rows.append([Paragraph(a, S["cell"]), Paragraph(b, S["num"])])

    promo_rows = [[Paragraph("Promosyon", S["cellb"]), Paragraph("Hf.", S["cellb"]),
                   Paragraph("İnd.", S["cellb"]), Paragraph("Lift", S["cellb"]),
                   Paragraph("Marka", S["cellb"])]]
    for a, b, c, d, e in [("Valentine's feature & display", "3", "%30", "3,0×", "%100"),
                          ("Holiday off-invoice", "5", "%15", "1,6×", "%100"),
                          ("Summer TPR", "4", "%20", "1,4×", "%50")]:
        promo_rows.append([Paragraph(a, S["cell"]), Paragraph(b, S["num"]), Paragraph(c, S["num"]),
                           Paragraph(d, S["num"]), Paragraph(e, S["num"])])
    promo_rows.append([Paragraph("Plansız indirimler için yedek", S["cell"]), Paragraph("—", S["num"]),
                       Paragraph("—", S["num"]), Paragraph("—", S["num"]), Paragraph("%2", S["numb"])])

    col_w = (CW - 12 * mm) / 3
    grid = Table([[
        table(cogs_rows, [col_w * 0.62, col_w * 0.38], align_right=[1]),
        table(chain_rows, [col_w * 0.52, col_w * 0.48], align_right=[1]),
        table(promo_rows, [col_w * 0.44, col_w * 0.11, col_w * 0.14, col_w * 0.14, col_w * 0.17],
              align_right=[1, 2, 3, 4]),
    ]], colWidths=[col_w + 4 * mm, col_w + 4 * mm, col_w + 4 * mm])
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm)]))
    st.append(grid)
    st.append(Spacer(1, 8))
    st.append(callout(
        "Hedefler: <b>hedef katkı marjı %22</b>, <b>bugünkü raf fiyatı $5.99</b>, "
        "<b>markanın hedeflediği raf fiyatı $6.49</b>. Programın bütün yorumu bu üç hedefe göre "
        "kuruluyor.", ACCENT_SOFT, CW))
    st.append(PageBreak())

    # ── 2. ana ekran haritası ───────────────────────────────────────────────
    wide_page(
        st, "EKRANIN HARİTASI", "Ana ekran beş bölgeden oluşur",
        "Ürünü girdikten sonra karşına çıkan ekran budur. Sol tarafta senin değiştirdiğin "
        "varsayımlar, ortada sonuçlar, sağda programın yorumu.",
        "01-main-full.png",
        blocks=[table([
            [Paragraph("Bölge", S["cellb"]), Paragraph("Ne var", S["cellb"]),
             Paragraph("Ne zaman bakarsın", S["cellb"])],
            [Paragraph("1 · Üst bar", S["cellb"]),
             Paragraph("Ürün ve senaryo seçici, müşteri profilleri, Reset / Save / Duplicate / Compare / History / Export", S["cell"]),
             Paragraph("Ürün veya senaryo değiştirirken, işini kaydederken", S["cellm"])],
            [Paragraph("2 · Özet kartları", S["cellb"]),
             Paragraph("Yedi başlık rakamı ve tek cümlelik hüküm", S["cell"]),
             Paragraph("“Durum ne?” — ekrana ilk bakışta", S["cellm"])],
            [Paragraph("3 · Varsayımlar", S["cellb"]),
             Paragraph("Maliyet, ithalat, kanal, promosyon ve hedefler; mavi kutular senin", S["cell"]),
             Paragraph("Bir sayıyı denemek istediğinde", S["cellm"])],
            [Paragraph("4 · Orta panel", S["cellb"]),
             Paragraph("Dört sekme: Price build · $ allocation · Sensitivity · Reverse &amp; fix", S["cell"]),
             Paragraph("Sonucun nedenini anlamak istediğinde", S["cellm"])],
            [Paragraph("5 · Advisor", S["cellb"]),
             Paragraph("Sayısal uyarı ve fırsatlar, altında model kontrolleri", S["cell"]),
             Paragraph("“Ne yapsam?” diye sorduğunda", S["cellm"])],
        ], [CW * 0.14, CW * 0.53, CW * 0.33])],
        img_h=95 * mm,
        caption="Godiva Sticks $5.99 raf fiyatıyla açık; sağdaki panel dört öneri üretmiş durumda.")

    # ── 3. üst bar ──────────────────────────────────────────────────────────
    wide_page(
        st, "1 · ÜST BAR", "Ürün, müşteri, senaryo ve işlemler",
        "Üst bar dört gruba ayrılmıştır: solda ürün, ortada müşteri profilleri ve senaryo, sağda "
        "işlem düğmeleri.",
        "02-topbar.png", img_h=26 * mm,
        blocks=[Table([[
            [Paragraph("Ürün grubu", S["h2"]),
             Paragraph("Ürün seçici (logolu), <b>New product</b> ve <b>Portfolio</b>. Birden fazla "
                       "ürünle çalışırken buradan geçiş yaparsın.", S["body"])],
            [Paragraph("Müşteri grubu", S["h2"]),
             Paragraph("Kayıtlı perakendeci/distribütör profillerini modele uygular. Bir markete "
                       "özel şartları her seferinde elle girmekten kurtarır.", S["body"])],
            [Paragraph("Senaryo grubu", S["h2"]),
             Paragraph("Açık senaryo ve zincir rozeti (<b>Route B</b>). Senaryo adının yanındaki "
                       "sarı nokta “kaydedilmemiş değişiklik var” demektir.", S["body"])],
            [Paragraph("İşlemler", S["h2"]),
             Paragraph("<b>Reset</b> son kayda döner · <b>Save</b> kaydeder ve değişikliği geçmişe "
                       "yazar · <b>Duplicate</b> yeni senaryo · <b>Compare</b> yan yana koyar · "
                       "<b>History</b> geçmiş · <b>Export</b> CSV indirir.", S["body"])],
        ]], colWidths=[CW / 4] * 4, style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (-1, 0), (-1, 0), 0),
            ("LEFTPADDING", (1, 0), (-1, 0), 5 * mm),
        ]))])

    # ── 4. özet kartları ────────────────────────────────────────────────────
    wide_page(
        st, "2 · ÖZET KARTLARI", "Yedi rakamda durumun tamamı",
        "Ekrana ilk bakışta okunması gereken satır budur. Godiva Sticks örneğinde kartlar şunu "
        "söylüyor: ürün hedeflenen $6.49 rafa neredeyse tam oturuyor, ama <b>bugünkü</b> $5.99 "
        "fiyatla hedeflenen kârın altında kalıyor.",
        "03-summary.png", img_h=34 * mm,
        blocks=[table([
            [Paragraph("Kart", S["cellb"]), Paragraph("Godiva", S["cellb"]),
             Paragraph("Ne demek", S["cellb"]),
             Paragraph("Kart", S["cellb"]), Paragraph("Godiva", S["cellb"]),
             Paragraph("Ne demek", S["cellb"])],
            [Paragraph("Target SRP", S["cell"]), Paragraph("$6.49", S["num"]),
             Paragraph("Senin hedeflediğin raf fiyatı (elle girilir).", S["cellm"]),
             Paragraph("Trade spend", S["cell"]), Paragraph("9,12%", S["num"]),
             Paragraph("Promosyon takviminden hesaplanan yıllık yük + %2 yedek.", S["cellm"])],
            [Paragraph("Calculated SRP", S["cell"]), Paragraph("$6.51", S["num"]),
             Paragraph("Hedef kârı korumak için <b>gereken</b> raf fiyatı.", S["cellm"]),
             Paragraph("Retailer margin", S["cell"]), Paragraph("%40", S["num"]),
             Paragraph("Perakendecinin kendi kâr oranı — pazarlık konusu.", S["cellm"])],
            [Paragraph("Brand invoice", S["cell"]), Paragraph("$3.29", S["num"]),
             Paragraph("Markanın kesmesi gereken fatura fiyatı.", S["cellm"]),
             Paragraph("Contribution margin", S["cell"]), Paragraph("%15,4", S["num"]),
             Paragraph("<b>Bugünkü</b> $5.99 fiyatta sana kalan. Hedef %22 → 6,6 puan eksik.", S["cellm"])],
            [Paragraph("Landed COGS", S["cell"]), Paragraph("$2.19", S["num"]),
             Paragraph("Navlun ve gümrük dahil, malın senin depona maliyeti.", S["cellm"]),
             Paragraph("Pricing gap", S["cell"]), Paragraph("+$0.18", S["num"]),
             Paragraph("Maliyet yapısı, bu raf fiyatının taşıdığından $0.18 yukarıda.", S["cellm"])],
        ], [CW * 0.11, CW * 0.07, CW * 0.32, CW * 0.12, CW * 0.07, CW * 0.31],
            align_right=[1, 4])],
        caption="Kırmızı/sarı/yeşil ton her yerde aynı anlama gelir: sorun · gözden geçir · sağlıklı.")

    # ── 5. varsayımlar paneli ───────────────────────────────────────────────
    rail_page(
        st, "3 · VARSAYIMLAR PANELİ", "Değiştirdiğin her şey burada",
        [Paragraph(
            "Panel bölüm bölüm açılır. <b>Mavi kutular senin</b>; gri satırlar programın hesabıdır "
            "ve elle değiştirilemez. Bir rakamı yazdığın anda bütün ekran yeniden hesaplanır — "
            "“Hesapla” düğmesi yoktur.", S["body"]),
         Paragraph("Bölümler", S["h2"])] +
        bullets([
            "<b>Product</b> — ürün adı, SKU ve <b>logo</b> (buradan yükleyip değiştirebilirsin).",
            "<b>Manufacturing</b> — üretim maliyeti ve üretici marjı.",
            "<b>Landed cost</b> — navlun, gümrük tarifesi ve yurt içi nakliye.",
            "<b>Commercial</b> — aracı komisyonu ve kesintiler.",
            "<b>Distributor</b> — distribütör marjı ve hizmet bedeli (yalnız distribütörlü zincirlerde görünür).",
            "<b>Retailer</b> — perakendeci marjı.",
            "<b>Promotions</b> — elle oran ya da promosyon takvimi.",
            "<b>Shelf price &amp; target</b> — hedef katkı marjı, bugünkü ve hedef raf fiyatı.",
        ]) +
        [Spacer(1, 4),
         callout("<b>Margin mi markup mı?</b> Her marj alanının yanında bu seçim vardır ve ikisi "
                 "farklı fiyat üretir: $1.48 maliyete %22 <i>margin</i> $1.90 verir, %22 "
                 "<i>markup</i> ise $1.81. Program hangisini kastettiğini asla tahmin etmez.",
                 EDIT_SOFT, RAIL, border=colors.HexColor("#96c5fa"))],
        "04-assumptions.png",
        caption="Godiva örneğinde Manufacturing bölümü açık: $1.48 maliyet, %22 margin → $1.90.")

    # ── 6. price build ──────────────────────────────────────────────────────
    rail_page(
        st, "4 · PRICE BUILD", "Fiyat kademe kademe nasıl oluşuyor",
        [Paragraph(
            "Üretim maliyetinden raf fiyatına kadar her kademe alt alta; her satırın altında bir "
            "önceki kademeye göre <b>ne eklendiği</b> yazar. Godiva örneğinde $1.48'lik çikolata, "
            "zincirin sonunda $6.51'lik rafa dönüşüyor.", S["body"]),
         facts([("Üretim maliyeti", "$1.48"), ("+ Üretici marjı", "+$0.42"),
                ("+ Navlun ve gümrük", "+$0.30"), ("+ Marka payı ve promosyon", "+$1.09"),
                ("+ Distribütör", "+$0.62"), ("+ Perakendeci marjı", "+$2.61"),
                ("= Gereken raf fiyatı", "$6.51")]),
         Spacer(1, 5),
         Paragraph(
            "En alttaki dört satır işin özeti: toplam promosyon yükü, net gelir ve bugünkü fiyatta "
            "eline geçen katkı. Godiva'da <b>$5.99</b> rafta net gelir <b>$2.70</b>, katkı "
            "<b>$0.42</b> yani <b>%15,4</b>.", S["body"]),
         callout("Satır başlarındaki küçük <b>bilgi simgesi</b> “Show Calculation” penceresini açar: formül, "
                 "girdiler ve ara adımlar. Bir sayıya güvenmediğinde ilk oraya bak.",
                 ACCENT_SOFT, RAIL)],
        "05-pricebuild.png")

    # ── 7. show calculation ─────────────────────────────────────────────────
    rail_page(
        st, "4a · SHOW CALCULATION", "Hiçbir sayı kara kutu değil",
        [Paragraph(
            "Hesaplanan her rakamın yanındaki bilgi simgesine tıklayınca bu pencere açılır: "
            "kullanılan <b>formül</b>, hangi <b>girdilerin</b> alındığı, <b>ara adımlar</b> ve sonuç.", S["body"]),
         Paragraph(
            "Bu, programın en çok işine yarayacak özelliklerinden biri: bir toplantıda “bu 6,51 "
            "nereden çıktı?” sorusuna ekranı çevirerek cevap verebilirsin.", S["body"]),
         callout("Ara değerler <b>yuvarlanmaz</b>. Kalemle her satırı yuvarlayarak toplarsan sonuç "
                 "1–2 sent oynayabilir; program tam hassasiyetle çalışır ve yalnızca ekranda "
                 "yuvarlar.", WARN_SOFT, RAIL)],
        "07-trace.png", plate_h=110 * mm)

    # ── 8. $ allocation ─────────────────────────────────────────────────────
    rail_page(
        st, "5 · $ ALLOCATION", "Tüketicinin $5.99'ı kime gidiyor?",
        [Paragraph(
            "Toplantıda göstermek için en anlaşılır ekran budur. Renkler <b>parayı kimin aldığını</b> "
            "anlatır: mavi perakendeci, mor distribütör, kehribar promosyon ailesi, kiremit değişken "
            "maliyetler, griler mal maliyeti — ve sondaki tek koyu yeşil, markada kalan pay.", S["body"]),
         facts([("Perakendeci", "$2.40 · %40"), ("Distribütör", "$0.57 · %9,6"),
                ("Promosyon", "$0.28 · %4,6"), ("Kesintiler", "$0.05 · %0,8"),
                ("Aracı ve değişken", "$0.09 · %1,5"), ("Lojistik ve gümrük", "$0.30 · %4,9"),
                ("Üretim maliyeti", "$1.48 · %24,7"), ("Üretici kârı", "$0.42 · %7"),
                ("Markaya kalan", "$0.42 · %6,9")]),
         Spacer(1, 5),
         callout("<b>Neden burada %6,9, kartta %15,4 yazıyor?</b> İkisi farklı paydaya bölünüyor: "
                 "buradaki pay <b>raf fiyatının</b> yüzdesi, kartlardaki katkı marjı ise "
                 "<b>net gelirin</b> yüzdesi. Aynı $0.42, iki farklı soruya cevap veriyor.",
                 ACCENT_SOFT, RAIL)],
        "08-allocation.png")

    # ── 9. sensitivity ──────────────────────────────────────────────────────
    rail_page(
        st, "6 · SENSITIVITY", "“Ya promosyon artarsa?”",
        [Paragraph(
            "Bir değişkeni kademe kademe oynatıp her kademede ne olduğunu gösterir. Test noktalarını "
            "kendin yazarsın (örnekte %5, 10, 15, 20, 25, 30).", S["body"]),
         Paragraph(
            "Godiva örneğinde promosyon yükü hikâyenin merkezi: <b>%15</b>'te katkı %9,4'e, "
            "<b>%25</b>'te <b>eksiye</b> düşüyor. Yani promosyon takvimini genişletme kararı, "
            "fiyat kararı kadar kritik.", S["body"]),
         facts([("Promosyon %5", "CM %19,1"), ("Promosyon %10", "CM %14,6"),
                ("Promosyon %15", "CM %9,4"), ("Promosyon %20", "CM %3,7"),
                ("Promosyon %25", "CM −%2,9"), ("Promosyon %30", "CM −%10,4")]),
         Spacer(1, 4),
         Paragraph(
            "Grafikte iki çizgi var: yeşil olan bugünkü fiyatta katkı marjı, mavi olan gereken raf "
            "fiyatı. İkisi aynı anda okunur — biri düşerken diğeri yükseliyorsa makas açılıyor demektir.",
            S["small"])],
        "09-sensitivity.png")

    # ── 10. matris ──────────────────────────────────────────────────────────
    rail_page(
        st, "6a · SENARYO MATRİSİ", "İki değişkeni aynı anda oynatmak",
        [Paragraph(
            "Satırlarda bir değişken, sütunlarda başka bir değişken, hücrelerde sonuç. Hücre "
            "renkleri sonucu okumayı hızlandırır: <font color='#056c4a'><b>yeşil</b></font> hedefin "
            "üstünde, <font color='#8a5600'><b>sarı</b></font> hedefin altında ama pozitif, "
            "<font color='#cc272b'><b>kırmızı</b></font> zarar.", S["body"]),
         Paragraph(
            "Bu ekran pazarlık masasının haritasıdır: “perakendeci %44 marj isterse promosyonu "
            "nereye çekmem gerekir?” sorusunun cevabı tek bakışta görünür.", S["body"]),
         callout("Üstteki <b>Cell shows</b> kutusundan hücrelerin “gereken raf fiyatı” mı yoksa "
                 "“bugünkü fiyatta katkı marjı” mı göstereceğini seçersin. Isı haritası ikinci "
                 "seçenekte devreye girer.", TINT, RAIL)],
        "10-matrix.png")

    # ── 11. reverse ─────────────────────────────────────────────────────────
    rail_page(
        st, "7 · REVERSE &amp; FIX", "Tersten hesap: maliyetim en fazla kaç olabilir?",
        [Paragraph(
            "Pazarlıkta en çok işe yarayan ekran. Üstteki kutuya hedef raf fiyatını yazarsın, "
            "program zinciri <b>geriye doğru</b> iner ve o fiyatın taşıyabileceği maksimum "
            "maliyeti söyler.", S["body"]),
         facts([("Hedef raf fiyatı", "$6.49"), ("↓ Perakendeci alış", "$3.89"),
                ("↓ Distribütör satışı", "$3.85"), ("↓ Maksimum fatura", "$3.28"),
                ("↓ Net gelir", "$2.93"), ("= Maks. landed maliyet", "$2.19")]),
         Spacer(1, 5),
         Paragraph(
            "Godiva örneğinde gerçek landed maliyet de $2.19 — yani <b>$6.49 rafı tam sınırda "
            "tutuyor</b>. Fiyat açığı yalnızca <b>+$0.01</b>. Bu, “hedef fiyat doğru seçilmiş ama "
            "hiç payımız yok” demektir.", S["body"]),
         callout("Tedarikçin fiyat zammı istediğinde bu ekranı aç: “$6.49 rafta kalacaksak sana en "
                 "fazla şu kadar ödeyebilirim” cümlesini rakamla kurarsın.", ACCENT_SOFT, RAIL)],
        "11-reverse.png")

    # ── 12. improve economics ───────────────────────────────────────────────
    rail_page(
        st, "7a · IMPROVE ECONOMICS", "Hedefi tutturmanın beş yolu",
        [Paragraph(
            "Model hedefin altındaysa bu bölüm açılır ve açığı kapatan <b>tek tek</b> değişiklikleri "
            "rakamıyla sıralar. Godiva örneğinde açık 6,6 puan; her satır bu açığı tek başına kapatır.",
            S["body"]),
         facts([("Raf fiyatını yükselt", "$5.99 → $6.51"),
                ("Landed maliyeti düşür", "$2.19 → $2.02"),
                ("Promosyonu azalt", "%9,1 → %1,6"),
                ("Perakendeci marjını pazarlık et", "%40 → %34,7"),
                ("Doğrudan sat", "CM %15,4 → %28,3")]),
         Spacer(1, 5),
         Paragraph(
            "Uygulanabilir olanların yanında düğme vardır; tıklayınca <b>yalnızca o varsayım</b> "
            "değişir, başka hiçbir şeye dokunulmaz. Listeyi okumak bile öğreticidir: promosyonu "
            "%1,6'ya indirmek gerçekçi değilse, gerçek çözümün fiyat ya da maliyet tarafında "
            "olduğunu görürsün.", S["body"]),
         callout("Bunlar <b>tek başına</b> hedefi tutturan değerlerdir. İkisini birden yaparsan "
                 "hedefe daha erken ulaşırsın.", TINT, RAIL)],
        "12-improve.png")

    # ── 13. promosyon planlayıcı ────────────────────────────────────────────
    rail_page(
        st, "8 · PROMOSYON PLANLAYICI", "Promosyon oranını tahmin etme, hesapla",
        [Paragraph(
            "“Yılda birkaç kampanya yaparız, %10 civarı tutar” cümlesi en pahalı cümledir. "
            "Planlayıcı her kampanyayı tek tek alır: kaç hafta, ne kadar indirim, satış kaç kat "
            "artıyor ve <b>indirimin yüzde kaçını marka ödüyor</b>.", S["body"]),
         Paragraph("Godiva takvimi", S["h2"]),
         facts([("Valentine's (3 hafta, %30)", "%4,31"),
                ("Holiday off-invoice (5 hafta, %15)", "%1,92"),
                ("Summer TPR (4 hafta, %20, yarısı)", "%0,89"),
                ("Promosyon toplamı", "%7,12"),
                ("+ plansızlar için yedek", "%2,00"),
                ("= Efektif trade spend", "%9,12")]),
         Spacer(1, 5),
         Paragraph(
            "Dikkat: Summer TPR'ın indirimi %20 ama maliyeti en düşük olan o — çünkü yarısını "
            "perakendeci finanse ediyor. Valentine's ise sadece 3 hafta sürmesine rağmen en pahalısı: "
            "yüksek indirim <b>ve</b> yüksek satış hacmi.", S["body"])],
        "13-planner.png")

    rail_page(
        st, "8a · PLANIN SONUCU", "Yüzde soyut, dolar somut",
        [Paragraph(
            "Planlayıcının altındaki özet, oranı hem promosyon bazında böler hem de <b>para "
            "cinsinden</b> gösterir. Örnekte 1 milyon dolarlık fatura cirosunda bu takvim "
            "<b>$91.246</b> promosyon gideri demek.", S["body"]),
         Paragraph(
            "Ayrıca oranın hangi <b>planlama aralığına</b> düştüğünü söyler. Bu aralıklar sabit "
            "değildir — <b>Edit planning bands</b> ile kendi sektör bilgine göre düzenlenebilir.", S["body"]),
         callout("Plan, sen <b>Apply to model</b> demeden modele işlemez. İstediğin kadar deneme "
                 "yapabilirsin.", ACCENT_SOFT, RAIL),
         Spacer(1, 4),
         Paragraph(
            "Normalize edilmiş hafta mantığı: promosyonlu haftalar satış hacmine göre ağırlıklanır, "
            "böylece “4 hafta indirim” değil, “yılın satışının ne kadarı indirimli geçti” hesaplanır.",
            S["small"])],
        "24-planner-summary.png")

    # ── 14. advisor ─────────────────────────────────────────────────────────
    rail_page(
        st, "9 · COMMERCIAL ADVISOR", "Programın yorumu — ama kararı senin",
        [Paragraph(
            "Sağ panel modeli sürekli izler ve üç seviyede yorum üretir: <font color='#cc272b'><b>Critical</b></font>, "
            "<font color='#8a5600'><b>Warning</b></font>, <font color='#056c4a'><b>Opportunity</b></font>. "
            "Godiva örneğinde bir uyarı ve üç fırsat çıkmış:", S["body"]),
         Spacer(1, 2)] +
        bullets([
            "<b>Uyarı:</b> $5.99 rafta %22 hedefi ulaşılamaz — yaklaşık $0.52 fiyat artışı ya da $0.18 maliyet düşüşü gerekir.",
            "<b>Fırsat:</b> aynı rafta doğrudan satış katkıyı %15,4 → %28,3'e taşır.",
            "<b>Fırsat:</b> perakendeci marjı %36'ya inerse gereken raf fiyatı $6.51 → $6.11.",
            "<b>Fırsat:</b> her $0.10 maliyet düşüşü gereken rafı $0.29 düşürüyor (×2,9 kaldıraç).",
        ]) +
        [Spacer(1, 4),
         callout("<b>Advisor hiçbir varsayımı kendiliğinden değiştirmez.</b> Her kartta yalnızca "
                 "<b>Explain</b> (arkasındaki rakamlar) ve <b>Ignore</b> (gizle) vardır. Uygulama "
                 "kararı her zaman insanda kalır.", ACCENT_SOFT, RAIL),
         Paragraph("Altındaki <b>Validation</b> bölümü ise modelin tutarlılığını denetler: eksik "
                   "girdi, çakışan promosyon haftası, imkânsız marj gibi durumları söyler.", S["small"])],
        "06-advisor.png")

    # ── 15. senaryolar ──────────────────────────────────────────────────────
    rail_page(
        st, "10 · SENARYOLAR", "“Ya perakendeci %44 marj isterse?”",
        [Paragraph(
            "<b>Duplicate</b> ile mevcut modelin kopyasını alıp adını koyarsın (hazır öneriler var: "
            "Base, Conservative, Retailer Request…). Kopyada tek bir varsayımı değiştirip "
            "<b>Save</b> dersin — orijinal senaryo olduğu gibi durur.", S["body"]),
         Paragraph(
            "Örnekte perakendeci marjını %40'tan %44'e çektik. Sonuç sert: gereken raf fiyatı "
            "$6.51 → <b>$6.98</b>, bugünkü fiyatta katkı %15,4 → <b>%9,5</b>.", S["body"]),
         facts([("Base — gereken SRP", "$6.51"), ("Base — katkı", "%15,4"),
                ("Retailer Request — SRP", "$6.98"), ("Retailer Request — katkı", "%9,5")]),
         Spacer(1, 4),
         Paragraph(
            "<b>Compare</b> senaryoları yan yana koyar ve her sütunu canlı hesaplar; iki teklifi "
            "aynı ekranda görmek pazarlıkta konuşmayı kolaylaştırır.", S["body"])],
        "18-compare.png", plate_h=105 * mm)

    rail_page(
        st, "10a · DEĞİŞİKLİK GEÇMİŞİ", "Neyi ne zaman değiştirdin?",
        [Paragraph(
            "Her <b>Save</b>, o kayıtta neyin değiştiğini tarihiyle birlikte yazar — hem girdiyi "
            "hem de o girdinin sonucu nasıl etkilediğini.", S["body"]),
         Paragraph(
            "Örnekte tek satırlık bir değişiklik üç sonucu birden kaydetmiş: perakendeci marjı "
            "%40 → %44, gereken raf fiyatı $6.51 → $6.98, katkı %15,4 → %9,5.", S["body"]),
         callout("Bu kayıt, haftalar sonra “biz bu fiyatı neden böyle bağlamıştık?” sorusuna cevap "
                 "veren yerdir. Modeli başkasına devrederken de en değerli belge budur.",
                 ACCENT_SOFT, RAIL)],
        "19-history.png", plate_h=95 * mm)

    # ── 16. portföy ─────────────────────────────────────────────────────────
    wide_page(
        st, "11 · PORTFOLIO", "Bütün ürünler tek tabloda",
        "Birden fazla ürünle çalışıyorsan bu ekran hepsinin ekonomisini tek satırda gösterir: "
        "maliyet, landed, fatura, marjlar, gereken raf fiyatı, katkı ve durum rozeti. Bir satıra "
        "tıklayınca o ürün fiyatlama ekranında açılır.",
        "15-portfolio.png", img_h=52 * mm,
        blocks=[Table([[
            [Paragraph("Durum rozetleri", S["h2"]),
             Paragraph("<font color='#056c4a'><b>Healthy</b></font> hedefte veya üstünde · "
                       "<font color='#8a5600'><b>Review</b></font> hedefin altında · "
                       "<font color='#cc272b'><b>Below threshold</b></font> kırmızı eşiğin altında. "
                       "Eşikleri sağ üstteki iki kutudan kendin belirlersin ve kaydedilir.", S["body"])],
            [Paragraph("Logolar burada da var", S["h2"]),
             Paragraph("Godiva Sticks yüklenmiş logosuyla, demo ürün ise adından türetilen renkli "
                       "monogramıyla görünür. Uzun listede ürünü aramak yerine göz tanır.", S["body"])],
        ]], colWidths=[CW / 2, CW / 2], style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (1, 0), 8 * mm),
        ]))])

    # ── 17. profiller ───────────────────────────────────────────────────────
    rail_page(
        st, "12 · MÜŞTERİ PROFİLLERİ", "Aynı marketin şartlarını bir kere yaz",
        [Paragraph(
            "Bir perakendeciyle çalışma şartların (marjı, komisyon, kesintiler, ödeme vadesi ve "
            "hangi distribütörle geldiği) her ürün için aynıdır. Profil olarak bir kere kaydedersin, "
            "sonra üst bardan seçtiğinde bütün şartlar modele işlenir.", S["body"]),
         Paragraph(
            "Distribütör profilinde marj ve birim başına hizmet bedeli tutulur; perakendeci profiline "
            "varsayılan distribütörünü bağlarsan ikisi birlikte gelir.", S["body"]),
         callout("Çakışma olursa öncelik sırası bellidir: <b>SKU + müşteri</b> özel değeri, sonra "
                 "<b>müşteri</b>, sonra <b>SKU</b>, en sonda <b>genel</b> varsayım kazanır.",
                 TINT, RAIL)],
        "14-profiles.png", plate_h=100 * mm)

    # ── 18. sihirbaz ────────────────────────────────────────────────────────
    rail_page(
        st, "13 · YENİ ÜRÜN — ADIM 3", "Ürün künyesi ve logo",
        [Paragraph(
            "<b>New product</b> beş adımlı bir sihirbaz açar. İlk iki adım şirket yapını ve satış "
            "zincirini sorar (acelen varsa <b>Skip guided setup</b>), üçüncü adım ürün künyesidir.",
            S["body"]),
         Paragraph(
            "Yalnızca <b>ürün adı</b> ve <b>SKU</b> zorunludur; gerisi isteğe bağlıdır ama raporlarda "
            "ve portföyde işine yarar. En altta <b>logo</b> alanı var: PNG, JPEG veya WebP yükleyebilirsin.",
            S["body"]),
         callout("Logo yüklemezsen program ürün adından bir <b>monogram</b> üretir — örnekteki "
                 "yeşil <b>GS</b> rozeti gibi. Yüklediğin görsel tarayıcında 256 piksele küçültülüp "
                 "sıkıştırılır, dışarı hiçbir yere gönderilmez.", EDIT_SOFT, RAIL,
                 border=colors.HexColor("#96c5fa")),
         Spacer(1, 3),
         Paragraph("Üstteki adım çipleri tamamlanan adımları onay işaretiyle gösterir; istediğin adıma geri "
                   "dönebilirsin.", S["small"])],
        "21-wizard-basics.png")

    rail_page(
        st, "13a · YENİ ÜRÜN — ADIM 4", "Maliyeti nasıl gireceksin?",
        [Paragraph("İki yol var:", S["body"]),
         Paragraph("<b>Simple</b> — bitmiş maliyeti biliyorsan tek rakam yazarsın.", S["body"]),
         Paragraph(
            "<b>Detailed</b> — kalem kalem girersin, program toplar. Godiva örneğinde beş kalem "
            "girdik: çikolata ve kakao $0.62, dolgu $0.18, ambalaj $0.34, üretim $0.26, fire $0.08 "
            "→ toplam <b>$1.48</b>.", S["body"]),
         Paragraph(
            "Detaylı mod, ileride “kakao %20 zamlandı” gibi bir gelişmeyi doğrudan ilgili kaleme "
            "yazıp etkisini görmeni sağlar. Bu yüzden ihracat yapan üreticiler için önerilir.", S["body"]),
         callout("Son adım (<b>Review</b>) ürünü fiyatlayabildiğini kontrol eder: hesaplanabiliyorsa "
                 "gereken raf fiyatını gösterir, hesaplanamıyorsa <b>Create product</b> düğmesi "
                 "kilitli kalır.", ACCENT_SOFT, RAIL)],
        "22-wizard-cogs.png")

    # ── 19. kapanış ─────────────────────────────────────────────────────────
    st.append(Paragraph("ÖZET", S["eyebrow"]))
    st.append(Paragraph("Godiva Sticks bize ne anlattı?", S["h1"]))
    st.append(Paragraph(
        "Tek bir ürünü baştan sona modellemek, programın bütün ekranlarını doğal sırasıyla "
        "kullandırdı. Örneğin sonucu şu üç cümlede toplanıyor:", S["lead"]))

    concl = Table([[
        [Paragraph("1 · Hedef fiyat doğru, bugünkü fiyat değil", S["h2"]),
         Paragraph("Marka $6.49 hedefliyor, model $6.51 diyor — hedef isabetli. Ama ürün bugün "
                   "rafta <b>$5.99</b>'a satılıyor ve o fiyatta katkı %22 yerine <b>%15,4</b>. "
                   "Sorun fiyat hedefinde değil, hedefle gerçek arasındaki 50 sentte.", S["body"])],
        [Paragraph("2 · Promosyon en kırılgan kalem", S["h2"]),
         Paragraph("Takvim bugün %9,12 tutuyor. Duyarlılık tablosu, bu oran <b>%25</b>'e çıkarsa "
                   "katkının <b>eksiye</b> döneceğini gösteriyor. Yeni bir kampanya eklemeden önce "
                   "bakılacak ilk yer burası.", S["body"])],
        [Paragraph("3 · Maliyetin kaldıracı yüksek", S["h2"]),
         Paragraph("Her $0.10 landed maliyet düşüşü gereken raf fiyatını <b>$0.29</b> düşürüyor. "
                   "Tedarik tarafındaki küçük bir kazanç, rafta üç katı etki yapıyor — pazarlık "
                   "enerjisini nereye harcayacağını bu sayı söylüyor.", S["body"])],
    ]], colWidths=[(CW - 16 * mm) / 3 + 5 * mm] * 3)
    concl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (-1, 0), 6 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
    ]))
    st.append(concl)
    st.append(Spacer(1, 10))
    st.append(Rule(CW, thickness=1.0, color=INK, space=12))

    tips = Table([[
        [Paragraph("Hatırlatmalar", S["h2"])] + bullets([
            "Veriler <b>senin tarayıcında</b> durur; buluta gitmez. Yedek için <b>Export</b> ile CSV al.",
            "Senaryo adının yanındaki sarı nokta “kaydedilmemiş değişiklik” demektir.",
            "Program bir hesap ve kontrol aracıdır; ticari kararı senin yerine vermez.",
        ]),
        [Paragraph("Sık kullanılan üç kısayol", S["h2"])] + bullets([
            "“Bu fiyata satsam ne kalır?” → Shelf price bölümüne yaz, <b>Contribution margin</b> kartına bak.",
            "“Maliyetim en fazla kaç olabilir?” → <b>Reverse &amp; fix</b> sekmesi.",
            "“Bu sayı nereden çıktı?” → Sayının yanındaki <b>bilgi simgesi</b>.",
        ]),
    ]], colWidths=[CW / 2 - 4 * mm, CW / 2 + 4 * mm])
    tips.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (1, 0), 8 * mm),
    ]))
    st.append(tips)
    st.append(Spacer(1, 8))
    st.append(callout(
        "Bu rehberdeki Godiva Sticks verileri temsilidir ve gerçek marka verisi değildir; amaç "
        "programın işleyişini gerçekçi bir örnek üzerinden anlatmaktır.", TINT, CW, style="small"))

    doc.build(st)
    return path


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    out = build(os.path.join(base, "Akif-CPG-Ornek-Rehber-Godiva-Sticks.pdf"))
    print(out, os.path.getsize(out), "bytes")
