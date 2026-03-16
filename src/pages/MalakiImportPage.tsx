import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Users, Building2, HandCoins, Banknote, DollarSign, Play, Eye, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ═══════════════════════════════════════════
// MALAKI EMPLOYEE DATA v2 — February 2026
// KEY: n=الاسم | no=رقم | b=الفرع | sd=تاريخ التعيين
// hr=معدل الساعة | adm=علاوة إدارية | tr=علاوة نقل
// ft=علاوة أكل (null=600 تلقائي) | w=زوجات | c=أبناء
// ha=ساعات فبراير | fs=ثابت فبراير | lb=قرض | ab=سلف
// ═══════════════════════════════════════════
interface EmpData {
  n: string; no: string; b: string; sd: string;
  hr: number; adm: number; tr: number; ft: number | null;
  w: number; c: number;
  ha: number; fs: number; lb: number; ab: number;
}

const MALAKY_EMPLOYEES: EmpData[] = [
  // ══════════ سفيان ══════════
  {n:"وليد قطب",no:"32",b:"سفيان",sd:"2024-04-01",hr:9.6,adm:0,tr:0,ft:null,w:1,c:1,ha:1438.4,fs:577.5,lb:0,ab:0},
  {n:"عمار جرارعة",no:"36",b:"سفيان",sd:"2018-09-01",hr:9.6,adm:500,tr:0,ft:null,w:1,c:2,ha:1884.8,fs:2140,lb:0,ab:0},
  {n:"حذيفة ياسين",no:"71",b:"سفيان",sd:"2020-02-01",hr:9.6,adm:500,tr:0,ft:null,w:0,c:0,ha:1901.44,fs:1660,lb:0,ab:0},
  {n:"صلاح ابو غزالة",no:"102",b:"سفيان",sd:"2021-06-01",hr:9.6,adm:0,tr:0,ft:600,w:0,c:0,ha:1334.08,fs:862.86,lb:0,ab:0},
  {n:"سامي جمهور",no:"110",b:"سفيان",sd:"2021-07-10",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:1345.44,fs:1116.43,lb:0,ab:0},
  {n:"محمد يعيش",no:"123",b:"سفيان",sd:"2022-02-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1149.28,fs:725.71,lb:0,ab:0},
  {n:"أوس صالح",no:"124",b:"سفيان",sd:"2022-03-11",hr:9.6,adm:300,tr:0,ft:800,w:0,c:0,ha:1086.24,fs:665.71,lb:0,ab:0},
  {n:"احمد ابو حاشية",no:"128",b:"سفيان",sd:"2022-06-02",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1326.08,fs:695.71,lb:0,ab:0},
  {n:"رهام حسون",no:"130",b:"سفيان",sd:"2022-05-01",hr:11.0,adm:500,tr:0,ft:null,w:0,c:0,ha:1774.85,fs:1340,lb:0,ab:0},
  {n:"ادهم ياسين",no:"137",b:"سفيان",sd:"2023-01-16",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:1568.16,fs:1068.57,lb:0,ab:0},
  {n:"احمد قوصيني",no:"149",b:"سفيان",sd:"2023-02-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:535.84,fs:288.57,lb:0,ab:0},
  {n:"عبد الغني ترياقي",no:"164",b:"سفيان",sd:"2023-06-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1455.84,fs:664.29,lb:0,ab:0},
  {n:"اسامة هندي",no:"165",b:"سفيان",sd:"2023-06-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2177.12,fs:800,lb:0,ab:0},
  {n:"عبد الجليل شولي",no:"166",b:"سفيان",sd:"2023-06-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1039.84,fs:388.57,lb:0,ab:0},
  {n:"عز الدين زادة",no:"175",b:"سفيان",sd:"2023-05-21",hr:9.6,adm:300,tr:0,ft:null,w:0,c:0,ha:1347.04,fs:637.14,lb:0,ab:0},
  {n:"يزن المصري",no:"241",b:"سفيان",sd:"2024-07-24",hr:9.6,adm:1000,tr:0,ft:null,w:0,c:0,ha:1573.44,fs:1442.86,lb:0,ab:0},
  {n:"امجد شبيري",no:"244",b:"سفيان",sd:"2024-08-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1463.2,fs:600,lb:0,ab:0},
  {n:"علاء ناصر",no:"261",b:"سفيان",sd:"2023-10-14",hr:9.6,adm:500,tr:0,ft:null,w:1,c:3,ha:2034.27,fs:1910,lb:0,ab:0},
  {n:"منيب سويسة",no:"262",b:"سفيان",sd:"2023-05-27",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:1183.36,fs:666.43,lb:0,ab:0},
  {n:"عبد الوهاب عبده",no:"295",b:"سفيان",sd:"2024-03-27",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1430.4,fs:580,lb:0,ab:0},
  {n:"حمزة خليل",no:"297",b:"سفيان",sd:"2024-05-05",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1275.2,fs:511.43,lb:0,ab:-26},
  {n:"محمد البنا",no:"299",b:"سفيان",sd:"2024-05-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1796,fs:640,lb:0,ab:0},
  {n:"نصر الله الخراز",no:"300",b:"سفيان",sd:"2024-05-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:0,fs:0,lb:0,ab:0},
  {n:"شريف الشريف",no:"503",b:"سفيان",sd:"2024-09-07",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1452.32,fs:620,lb:0,ab:0},
  {n:"سامح رماحة",no:"508",b:"سفيان",sd:"2024-08-15",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:671.84,fs:646.07,lb:0,ab:0},
  {n:"يحيى جبر",no:"519",b:"سفيان",sd:"2025-01-25",hr:9.6,adm:0,tr:0,ft:null,w:1,c:4,ha:2050.24,fs:1080,lb:0,ab:0},
  {n:"امير ناصر",no:"526",b:"سفيان",sd:"2025-05-03",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1438.72,fs:480,lb:0,ab:0},
  {n:"احمد سركجي",no:"544",b:"سفيان",sd:"2025-08-14",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1520.32,fs:520,lb:0,ab:0},
  {n:"محمود بيطار",no:"547",b:"سفيان",sd:"2025-10-24",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:954.88,fs:460,lb:0,ab:0},
  {n:"سارة إسكندر",no:"549",b:"سفيان",sd:"2025-11-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1911.04,fs:580,lb:0,ab:0},
  {n:"وسيم صدر",no:"551",b:"سفيان",sd:"2025-12-06",hr:9.6,adm:500,tr:0,ft:null,w:1,c:6,ha:1687.2,fs:1660,lb:0,ab:0},
  {n:"فراس الشريف",no:"552",b:"سفيان",sd:"2025-12-20",hr:9.6,adm:0,tr:0,ft:null,w:1,c:1,ha:1722.88,fs:580,lb:0,ab:0},
  {n:"محمد عنبتاوي",no:"554",b:"سفيان",sd:"2025-12-02",hr:12.0,adm:0,tr:0,ft:null,w:1,c:3,ha:643.4,fs:0,lb:0,ab:0},
  {n:"تامر ترابي",no:"555",b:"سفيان",sd:"2025-12-30",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:1411.52,fs:520,lb:0,ab:0},
  {n:"عمار نصار",no:"561",b:"سفيان",sd:"2026-01-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1279.52,fs:0,lb:0,ab:0},
  {n:"فادي ميالة",no:"573",b:"سفيان",sd:"2026-02-23",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:325.12,fs:0,lb:0,ab:0},
  {n:"امير شتية",no:"575",b:"سفيان",sd:"2026-03-01",hr:9.6,adm:0,tr:0,ft:null,w:1,c:0,ha:0,fs:0,lb:0,ab:0},
  {n:"هادي طبعوني",no:"205",b:"سفيان",sd:"2023-07-22",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1247.36,fs:435.71,lb:0,ab:0},
  {n:"اياد البزرة",no:"",b:"سفيان",sd:"2023-08-01",hr:9.6,adm:1500,tr:0,ft:null,w:1,c:4,ha:2420,fs:2780,lb:0,ab:0},
  {n:"عبد الله صايمة",no:"",b:"سفيان",sd:"2023-01-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:3100,fs:300,lb:0,ab:0},

  // ══════════ فيصل ══════════
  {n:"حذيفة غزال",no:"99",b:"فيصل",sd:"2021-08-10",hr:9.6,adm:500,tr:0,ft:600,w:0,c:0,ha:1345.6,fs:1187.14,lb:600,ab:0},
  {n:"مجاهد شخشير",no:"106",b:"فيصل",sd:"2019-12-01",hr:9.6,adm:300,tr:0,ft:null,w:0,c:0,ha:1564.32,fs:1380,lb:600,ab:0},
  {n:"حسام شخشير",no:"108",b:"فيصل",sd:"2019-12-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1972.32,fs:1100,lb:0,ab:0},
  {n:"عاصم مخلوف",no:"113",b:"فيصل",sd:"2021-05-12",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:1758.72,fs:1330,lb:0,ab:0},
  {n:"مصعب قطب",no:"116",b:"فيصل",sd:"2021-01-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1514.72,fs:850.71,lb:0,ab:0},
  {n:"محمد السايح",no:"118",b:"فيصل",sd:"2019-11-01",hr:9.6,adm:1000,tr:0,ft:null,w:1,c:1,ha:1943.2,fs:2410,lb:0,ab:0},
  {n:"حمزة عبد المجيد",no:"139",b:"فيصل",sd:"2023-01-07",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:770.4,fs:671.07,lb:625,ab:0},
  {n:"عبد الرحمن عليوي",no:"145",b:"فيصل",sd:"2023-02-10",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:651.2,fs:319.29,lb:0,ab:0},
  {n:"احمد جابر",no:"163",b:"فيصل",sd:"2023-09-27",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1161.28,fs:637.14,lb:650,ab:0},
  {n:"نايف شهاب",no:"178",b:"فيصل",sd:"2023-09-01",hr:9.6,adm:0,tr:0,ft:null,w:1,c:0,ha:1721.28,fs:860,lb:0,ab:0},
  {n:"محمد دويكات",no:"183",b:"فيصل",sd:"2023-10-02",hr:9.6,adm:0,tr:0,ft:null,w:1,c:3,ha:1450.88,fs:759.29,lb:0,ab:0},
  {n:"واصف طوقان",no:"197",b:"فيصل",sd:"2023-06-01",hr:9.6,adm:500,tr:0,ft:null,w:1,c:2,ha:1546.72,fs:1520,lb:0,ab:0},
  {n:"حسني الصلاج",no:"199",b:"فيصل",sd:"2023-08-01",hr:9.6,adm:0,tr:0,ft:null,w:1,c:5,ha:1455.68,fs:1230,lb:0,ab:0},
  {n:"رانية قتلوني",no:"213",b:"فيصل",sd:"2023-06-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1432.96,fs:450,lb:0,ab:0},
  {n:"تالا حميض",no:"214",b:"فيصل",sd:"2023-07-16",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1311.52,fs:442.86,lb:0,ab:0},
  {n:"محمود الداموني",no:"221",b:"فيصل",sd:"2023-09-02",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:883.68,fs:307.14,lb:0,ab:0},
  {n:"جهاد الخليلي",no:"242",b:"فيصل",sd:"2024-07-18",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:990.08,fs:344.29,lb:0,ab:0},
  {n:"عبد الله كوتة",no:"296",b:"فيصل",sd:"2024-05-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2091.52,fs:660,lb:0,ab:0},
  {n:"مراد ابو غضيب",no:"298",b:"فيصل",sd:"2024-05-16",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:764.32,fs:230,lb:0,ab:0},
  {n:"ابراهيم شموط",no:"308",b:"فيصل",sd:"2024-05-28",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1637.44,fs:560,lb:0,ab:0},
  {n:"حمزة السخلة",no:"506",b:"فيصل",sd:"2024-09-03",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1389.6,fs:538.57,lb:500,ab:0},
  {n:"صبيح شالو",no:"507",b:"فيصل",sd:"2024-10-13",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1302.72,fs:558.57,lb:0,ab:0},
  {n:"محمد حبش",no:"516",b:"فيصل",sd:"2024-11-30",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1124,fs:320.71,lb:0,ab:0},
  {n:"محمد عرندي",no:"527",b:"فيصل",sd:"2025-05-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1424.64,fs:480,lb:0,ab:0},
  {n:"احمد بسطامي",no:"529",b:"فيصل",sd:"2025-05-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1241.6,fs:440,lb:0,ab:0},
  {n:"عمر الجدي",no:"530",b:"فيصل",sd:"2025-05-10",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2005.28,fs:520,lb:0,ab:0},
  {n:"ايهم حشاش",no:"539",b:"فيصل",sd:"2025-06-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1116.16,fs:280,lb:0,ab:0},
  {n:"ترتيل دنديس",no:"548",b:"فيصل",sd:"2025-11-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1546.08,fs:520,lb:0,ab:0},
  {n:"هيثم ابو صالحة",no:"550",b:"فيصل",sd:"2025-11-06",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1527.52,fs:500,lb:0,ab:0},
  {n:"ثائر شلبي",no:"553",b:"فيصل",sd:"2025-10-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1014.72,fs:280,lb:0,ab:0},
  {n:"عمران رداد",no:"556",b:"فيصل",sd:"2026-01-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1430.4,fs:0,lb:0,ab:0},
  {n:"عبد الرحمن عيد",no:"558",b:"فيصل",sd:"2026-01-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1269.44,fs:0,lb:0,ab:0},
  {n:"احمد دويكات",no:"559",b:"فيصل",sd:"2026-01-19",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1398.24,fs:0,lb:0,ab:0},
  {n:"شريف هواش",no:"560",b:"فيصل",sd:"2026-01-07",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1163.68,fs:0,lb:0,ab:0},
  {n:"جهاد جاموس",no:"562",b:"فيصل",sd:"2026-01-17",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1598.72,fs:0,lb:0,ab:0},
  {n:"يسرى ادعيس",no:"563",b:"فيصل",sd:"2026-01-31",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1232.32,fs:0,lb:0,ab:0},
  {n:"صهيب سليمان",no:"564",b:"فيصل",sd:"2026-02-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1525.28,fs:0,lb:0,ab:0},
  {n:"عمر جاموس",no:"565",b:"فيصل",sd:"2026-02-02",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1486.56,fs:0,lb:0,ab:0},
  {n:"احمد هندية",no:"567",b:"فيصل",sd:"2026-02-05",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:980.48,fs:0,lb:0,ab:0},
  {n:"اية دنديس",no:"568",b:"فيصل",sd:"2026-02-06",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1424,fs:0,lb:0,ab:0},
  {n:"هيا صوصة",no:"569",b:"فيصل",sd:"2026-02-08",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:645.76,fs:0,lb:0,ab:0},
  {n:"احمد طوقان",no:"570",b:"فيصل",sd:"2026-02-08",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:880.48,fs:0,lb:0,ab:0},
  {n:"ايمان جعفر",no:"571",b:"فيصل",sd:"2026-02-08",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:842.24,fs:0,lb:0,ab:0},
  {n:"هالة حسون",no:"572",b:"فيصل",sd:"2026-02-08",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:634.08,fs:0,lb:0,ab:0},
  {n:"لين الشيخ عبد الله",no:"1018",b:"فيصل",sd:"2025-06-22",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1280.32,fs:500,lb:0,ab:0},
  {n:"احمد حسين",no:"1059",b:"فيصل",sd:"2025-09-28",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1071.04,fs:280,lb:0,ab:294},
  {n:"محمد الشريف",no:"",b:"فيصل",sd:"",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1200,fs:0,lb:0,ab:2547},
  {n:"محمد بشارات",no:"",b:"فيصل",sd:"",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2000,fs:0,lb:0,ab:0},
  {n:"مهدي سليم",no:"",b:"فيصل",sd:"2026-01-04",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2000,fs:0,lb:0,ab:0},

  // ══════════ المركزي ══════════
  {n:"معاذ قطب",no:"62",b:"مركزي",sd:"2019-06-01",hr:9.6,adm:400,tr:0,ft:null,w:0,c:0,ha:3141.6,fs:1460,lb:0,ab:0},
  {n:"هاني نصار",no:"93",b:"مركزي",sd:"2021-05-20",hr:9.6,adm:500,tr:0,ft:null,w:1,c:4,ha:2624,fs:1980,lb:0,ab:0},
  {n:"علي السقا",no:"500",b:"مركزي",sd:"2024-06-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:3164.48,fs:620,lb:0,ab:0},
  {n:"عماد بزرة",no:"521",b:"مركزي",sd:"2025-02-01",hr:9.6,adm:0,tr:0,ft:null,w:1,c:4,ha:1468,fs:1120,lb:0,ab:0},
  {n:"حمزة فضة",no:"522",b:"مركزي",sd:"2025-03-03",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2258.24,fs:600,lb:0,ab:0},
  {n:"عبادة قط",no:"536",b:"مركزي",sd:"2025-05-28",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:2092.81,fs:840,lb:0,ab:0},
  {n:"نمر هندي",no:"574",b:"المركزي",sd:"2026-02-24",hr:9.6,adm:0,tr:0,ft:null,w:1,c:0,ha:253.6,fs:0,lb:0,ab:0},

  // ══════════ الطيرة ══════════
  {n:"احمد ملحم",no:"1005",b:"الطيرة",sd:"2025-06-03",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2803.25,fs:0,lb:0,ab:0},
  {n:"مؤمن جعاريم",no:"1010",b:"الطيرة",sd:"2025-06-06",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:710.4,fs:180,lb:0,ab:0},
  {n:"عبد الجواد جبريل",no:"1011",b:"الطيرة",sd:"2025-05-31",hr:9.6,adm:500,tr:0,ft:null,w:0,c:0,ha:1444.32,fs:872.86,lb:0,ab:0},
  {n:"حمزة مخالفة",no:"1013",b:"الطيرة",sd:"2025-06-19",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:1828.48,fs:820,lb:0,ab:0},
  {n:"ادم نوفل",no:"1014",b:"الطيرة",sd:"2025-06-19",hr:9.6,adm:500,tr:0,ft:null,w:0,c:0,ha:1990.88,fs:980,lb:0,ab:0},
  {n:"هيثم ابو عابد",no:"1016",b:"الطيرة",sd:"2025-06-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1807.84,fs:440,lb:0,ab:0},
  {n:"عبد الله طنينة",no:"1017",b:"الطيرة",sd:"2025-06-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1084.64,fs:300,lb:0,ab:0},
  {n:"انس ابو صلاح",no:"1019",b:"الطيرة",sd:"2025-06-28",hr:9.6,adm:0,tr:0,ft:null,w:1,c:0,ha:612.8,fs:300,lb:0,ab:256},
  {n:"عمرو اعمير",no:"1026",b:"الطيرة",sd:"2025-07-05",hr:9.6,adm:0,tr:0,ft:null,w:1,c:1,ha:1908.64,fs:710,lb:0,ab:0},
  {n:"ادهم قرارية",no:"1028",b:"الطيرة",sd:"2025-07-06",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1789.44,fs:300,lb:0,ab:0},
  {n:"شريف جمعة",no:"1031",b:"الطيرة",sd:"2025-07-13",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1930.4,fs:500,lb:0,ab:290},
  {n:"بسملة أبو كويك",no:"1035",b:"الطيرة",sd:"2025-07-16",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1477.92,fs:460,lb:0,ab:0},
  {n:"أسامة علان",no:"1040",b:"الطيرة",sd:"2025-07-23",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1119.36,fs:300,lb:0,ab:0},
  {n:"محمد عبيات",no:"1042",b:"الطيرة",sd:"2025-07-27",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1379.2,fs:480,lb:0,ab:0},
  {n:"ميسم يحيى",no:"1044",b:"الطيرة",sd:"2025-07-28",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1839.2,fs:500,lb:0,ab:0},
  {n:"علاء الدين وادي",no:"1046",b:"الطيرة",sd:"2025-08-02",hr:9.6,adm:0,tr:0,ft:null,w:1,c:2,ha:1234.72,fs:542.86,lb:0,ab:0},
  {n:"انس حجاج",no:"1048",b:"الطيرة",sd:"2025-08-07",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2396.96,fs:1540,lb:0,ab:0},
  {n:"نائل أبو علي",no:"1051",b:"الطيرة",sd:"2025-08-16",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1862.72,fs:480,lb:0,ab:0},
  {n:"عمر ضبابات",no:"1062",b:"الطيرة",sd:"2025-10-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1583.52,fs:440,lb:0,ab:0},
  {n:"ابراهيم قيسية",no:"1063",b:"الطيرة",sd:"2025-10-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1612,fs:280,lb:0,ab:0},
  {n:"عثمان الاحمد",no:"1064",b:"الطيرة",sd:"2025-10-04",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1585.6,fs:500,lb:0,ab:0},
  {n:"احمد ابو صلاح",no:"1068",b:"الطيرة",sd:"2025-10-17",hr:9.6,adm:0,tr:0,ft:null,w:1,c:0,ha:732.32,fs:200,lb:0,ab:0},
  {n:"نور طنينة",no:"1071",b:"الطيرة",sd:"2025-10-29",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1374.08,fs:500,lb:0,ab:0},
  {n:"انس جوابرة",no:"1072",b:"الطيرة",sd:"2025-10-31",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1856.64,fs:520,lb:0,ab:0},
  {n:"لطفي العيسي",no:"1073",b:"الطيرة",sd:"2025-11-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1670.56,fs:460,lb:0,ab:0},
  {n:"سامر فيالة",no:"1076",b:"الطيرة",sd:"2025-11-17",hr:9.6,adm:0,tr:0,ft:null,w:1,c:4,ha:1641.92,fs:960,lb:0,ab:0},
  {n:"سمير حاج مير",no:"1077",b:"الطيرة",sd:"2025-11-19",hr:9.6,adm:1000,tr:0,ft:null,w:1,c:2,ha:1870.08,fs:1860,lb:0,ab:0},
  {n:"محمد حسين",no:"1078",b:"الطيرة",sd:"2025-11-20",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1172.48,fs:300,lb:0,ab:0},
  {n:"طارق سدر",no:"1079",b:"الطيرة",sd:"2025-11-23",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:2376,fs:540,lb:0,ab:0},
  {n:"غسان مرشود",no:"1080",b:"الطيرة",sd:"2025-12-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:996.32,fs:220,lb:0,ab:0},
  {n:"المعتصم بالله عناتي",no:"1081",b:"الطيرة",sd:"2025-12-01",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1760,fs:500,lb:0,ab:0},
  {n:"ممدوح ابو كرش",no:"1083",b:"الطيرة",sd:"2025-12-13",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1961.28,fs:500,lb:0,ab:78},
  {n:"حنين القيسي",no:"1084",b:"الطيرة",sd:"2026-01-12",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1359.52,fs:480,lb:0,ab:0},
  {n:"محي الدين العبيات",no:"1085",b:"الطيرة",sd:"2026-02-02",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1668.16,fs:0,lb:0,ab:0},
  {n:"سامح ملحم",no:"1086",b:"الطيرة",sd:"2026-01-25",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1012.64,fs:280,lb:0,ab:69},
  {n:"عمر ذيبة",no:"1087",b:"الطيرة",sd:"2026-01-25",hr:9.6,adm:0,tr:0,ft:null,w:0,c:0,ha:1270.88,fs:520,lb:0,ab:0},
  {n:"عبادة اشتية",no:"533",b:"الطيرة",sd:"2025-06-01",hr:9.6,adm:0,tr:300,ft:null,w:0,c:0,ha:2476.48,fs:1040,lb:0,ab:0},
];

const BRANCHES = ["سفيان", "فيصل", "المركزي", "مركزي", "الطيرة"];

// Stats
const loanCount = MALAKY_EMPLOYEES.filter(e => e.lb > 0).length;
const advanceCount = MALAKY_EMPLOYEES.filter(e => e.ab > 0).length;

export default function MalakiImportPage() {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<{
    success: number; skipped: number; failed: { name: string; error: string }[];
    loans: number; advances: number;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const total = MALAKY_EMPLOYEES.length;

  const startImport = useCallback(async () => {
    if (!user) return;
    setImporting(true);
    setCurrent(0);
    setDone(false);
    setResults(null);

    const res = { success: 0, skipped: 0, failed: [] as { name: string; error: string }[], loans: 0, advances: 0 };

    try {
      // 1. Ensure branches exist
      const branchMap: Record<string, string> = {};
      const uniqueBranches = [...new Set(MALAKY_EMPLOYEES.map(e => e.b))];
      for (const bName of uniqueBranches) {
        const normalizedName = bName === "مركزي" ? "المركزي" : bName;
        if (branchMap[normalizedName]) { branchMap[bName] = branchMap[normalizedName]; continue; }

        const { data: existing } = await supabase
          .from("branches")
          .select("id")
          .eq("user_id", user.id)
          .or(`name.eq.${normalizedName},name.eq.${bName}`)
          .maybeSingle();

        if (existing) {
          branchMap[bName] = existing.id;
          branchMap[normalizedName] = existing.id;
        } else {
          const { data: created } = await supabase
            .from("branches")
            .insert({
              user_id: user.id,
              name: normalizedName,
              latitude: 32.22,
              longitude: 35.26,
              radius_meters: 200,
            })
            .select("id")
            .single();
          if (created) {
            branchMap[bName] = created.id;
            branchMap[normalizedName] = created.id;
          }
        }
      }

      // 2. Import employees
      for (let i = 0; i < MALAKY_EMPLOYEES.length; i++) {
        const emp = MALAKY_EMPLOYEES[i];
        setCurrent(i + 1);

        // Check duplicate by name
        const { data: exists } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("full_name", emp.n.trim())
          .maybeSingle();

        if (exists) {
          // Update existing employee with new Malaki fields
          await supabase.from("employees").update({
            start_date: emp.sd || null,
            hourly_rate: emp.hr,
            admin_allowance: emp.adm,
            transfer_allowance: emp.tr,
            food_transport_override: emp.ft,
            wives_count: emp.w,
            children_count: emp.c,
          } as any).eq("id", exists.id);
          res.skipped++;
          continue;
        }

        // Determine salary type
        const salaryType = emp.fs > 0 ? "شهري" : "بالساعة";

        // Insert employee with all Malaki fields
        const { data: newEmp, error } = await supabase
          .from("employees")
          .insert({
            user_id: user.id,
            full_name: emp.n.trim(),
            id_number: emp.no || null,
            branch_id: branchMap[emp.b] || null,
            base_salary: emp.fs || 0,
            salary_type: salaryType,
            contract_type: "دائم",
            is_active: true,
            start_date: emp.sd || null,
            hourly_rate: emp.hr,
            admin_allowance: emp.adm,
            transfer_allowance: emp.tr,
            food_transport_override: emp.ft,
            wives_count: emp.w,
            children_count: emp.c,
            notes: `مستورد من كشف رواتب فبراير 2026 v2${emp.no ? ` | رقم: ${emp.no}` : ""}`,
          } as any)
          .select("id")
          .single();

        if (error || !newEmp) {
          res.failed.push({ name: emp.n, error: error?.message || "Unknown error" });
          continue;
        }

        // Loan (قرض حسن)
        if (emp.lb > 0) {
          await supabase.from("employee_advances").insert({
            employee_id: newEmp.id,
            user_id: user.id,
            advance_type: "قرض_حسن",
            amount: emp.lb,
            status: "approved",
            request_date: "2026-02-01",
            notes: "رصيد افتتاحي قرض حسن — فبراير 2026",
            installments_count: 12,
            installment_amount: Math.round(emp.lb / 12),
          } as any);
          res.loans++;
        }

        // Open advance (سلفة مفتوحة)
        if (emp.ab > 0) {
          await supabase.from("employee_advances").insert({
            employee_id: newEmp.id,
            user_id: user.id,
            advance_type: "سلفة_راتب",
            amount: emp.ab,
            status: "approved",
            request_date: "2026-02-01",
            notes: "رصيد سلف مفتوح — مستورد من فبراير 2026",
            installments_count: 1,
            installment_amount: emp.ab,
          } as any);
          res.advances++;
        }

        // Negative carry-over (فائض راتب)
        if (emp.ab < 0) {
          await supabase.from("employee_advances").insert({
            employee_id: newEmp.id,
            user_id: user.id,
            advance_type: "فائض_راتب",
            amount: Math.abs(emp.ab),
            status: "approved",
            request_date: "2026-02-01",
            notes: "فائض راتب من الشهر السابق",
            installments_count: 1,
            installment_amount: Math.abs(emp.ab),
          } as any);
        }

        res.success++;
      }
    } catch (err: any) {
      toast.error("خطأ غير متوقع: " + err.message);
    }

    setResults(res);
    setImporting(false);
    setDone(true);

    if (res.success > 0) {
      toast.success(`✅ تم استيراد ${res.success} موظف بنجاح`);
    }
  }, [user]);

  const progressPct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[900px] mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-foreground">استيراد موظفي الملكي v2 — فبراير 2026</h1>
          <p className="text-xs text-muted-foreground">استيراد {total} موظف مع بيانات الرواتب الكاملة</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <Users className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">موظف</p>
        </Card>
        <Card className="p-3 text-center">
          <Building2 className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">4</p>
          <p className="text-[10px] text-muted-foreground">فروع</p>
        </Card>
        <Card className="p-3 text-center">
          <HandCoins className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{loanCount}</p>
          <p className="text-[10px] text-muted-foreground">قروض حسنة</p>
        </Card>
        <Card className="p-3 text-center">
          <Banknote className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{advanceCount}</p>
          <p className="text-[10px] text-muted-foreground">سلف مفتوحة</p>
        </Card>
      </div>

      {/* Action buttons */}
      {!done && (
        <div className="flex gap-3">
          <Button
            variant="default"
            size="lg"
            className="flex-1 gap-2 text-base"
            onClick={startImport}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            {importing ? "جاري الاستيراد..." : "▶ بدء الاستيراد v2"}
          </Button>
          <Button variant="secondary" size="lg" className="gap-2" onClick={() => setShowPreview(true)}>
            <Eye className="h-5 w-5" /> معاينة البيانات
          </Button>
        </div>
      )}

      {/* Progress */}
      {importing && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">جاري استيراد الموظفين...</span>
            <span className="font-bold text-foreground">{current}/{total}</span>
          </div>
          <Progress value={progressPct} className="h-3" />
          <p className="text-xs text-muted-foreground text-center">{progressPct}%</p>
        </Card>
      )}

      {/* Results */}
      {done && results && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-lg font-bold text-foreground">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            تمت عملية الاستيراد v2
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium">✅ تم استيراد {results.success} موظف جديد</p>
            {results.skipped > 0 && (
              <p className="text-muted-foreground">🔄 تم تحديث {results.skipped} موظف موجود (إضافة حقول الملكي)</p>
            )}
            {results.loans > 0 && (
              <p className="text-primary">🏦 {results.loans} قروض حسنة</p>
            )}
            {results.advances > 0 && (
              <p className="text-primary">💸 {results.advances} سلف مفتوحة</p>
            )}
            {results.failed.length > 0 && (
              <div className="mt-3 bg-destructive/10 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">فشل ({results.failed.length})</span>
                </div>
                {results.failed.map((f, i) => (
                  <p key={i} className="text-xs text-destructive/80">{f.name}: {f.error}</p>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة بيانات {total} موظف — v2</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">رقم</TableHead>
                  <TableHead className="text-right">الفرع</TableHead>
                  <TableHead className="text-right">تاريخ التعيين</TableHead>
                  <TableHead className="text-right">₪/ساعة</TableHead>
                  <TableHead className="text-right">إدارية</TableHead>
                  <TableHead className="text-right">نقل</TableHead>
                  <TableHead className="text-right">أكل</TableHead>
                  <TableHead className="text-right">ز/أ</TableHead>
                  <TableHead className="text-right">قرض</TableHead>
                  <TableHead className="text-right">سلفة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MALAKY_EMPLOYEES.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-xs">{e.n}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.no || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{e.b}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.sd || "-"}</TableCell>
                    <TableCell className="text-xs">{e.hr}</TableCell>
                    <TableCell className="text-xs">{e.adm > 0 ? e.adm : "-"}</TableCell>
                    <TableCell className="text-xs">{e.tr > 0 ? e.tr : "-"}</TableCell>
                    <TableCell className="text-xs">{e.ft !== null ? e.ft : "600"}</TableCell>
                    <TableCell className="text-xs">{e.w > 0 || e.c > 0 ? `${e.w}/${e.c}` : "-"}</TableCell>
                    <TableCell className="text-xs">{e.lb > 0 ? e.lb : "-"}</TableCell>
                    <TableCell className="text-xs">{e.ab !== 0 ? e.ab : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
