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
// MALAKI EMPLOYEE DATA — February 2026 Payroll
// ═══════════════════════════════════════════
interface EmpData {
  n: string; no: string; b: string; j: string;
  fs: number; ha: number; la: number;
  aft: number; aa: number; af: number; ao: number;
  df: number; lb: number; ab: number;
}

const MALAKY_EMPLOYEES: EmpData[] = [
  // ═══════════════ فرع سفيان ═══════════════
  {n:"وليد قطب",no:"32",b:"سفيان",j:"مطبخ",fs:577.5,ha:1438.4,la:0,aft:300,aa:100,af:270,ao:0,df:92.5,lb:0,ab:0},
  {n:"عمار جرارعة",no:"36",b:"سفيان",j:"مطبخ",fs:2140,ha:1884.8,la:0,aft:600,aa:700,af:340,ao:500,df:0,lb:0,ab:0},
  {n:"حذيفة ياسين",no:"71",b:"سفيان",j:"اداري",fs:1660,ha:1901.44,la:0,aft:560,aa:600,af:0,ao:500,df:0,lb:0,ab:0},
  {n:"صلاح ابو غزالة",no:"102",b:"سفيان",j:"صالة",fs:862.86,ha:1334.08,la:0,aft:520,aa:400,af:0,ao:0,df:57.14,lb:0,ab:0},
  {n:"سامي جمهور",no:"110",b:"سفيان",j:"صالة",fs:1116.43,ha:1345.44,la:0,aft:480,aa:400,af:410,ao:0,df:173.57,lb:0,ab:0},
  {n:"محمد يعيش",no:"123",b:"سفيان",j:"صالة",fs:725.71,ha:1149.28,la:0,aft:440,aa:400,af:0,ao:0,df:114.29,lb:0,ab:0},
  {n:"أوس صالح",no:"124",b:"سفيان",j:"مطبخ",fs:665.71,ha:1086.24,la:0,aft:280,aa:300,af:0,ao:300,df:214.29,lb:0,ab:0},
  {n:"احمد ابو حاشية",no:"128",b:"سفيان",j:"مطبخ",fs:695.71,ha:1326.08,la:0,aft:460,aa:300,af:0,ao:0,df:64.29,lb:0,ab:0},
  {n:"رهام حسون",no:"130",b:"سفيان",j:"اداري",fs:1340,ha:1774.85,la:0,aft:540,aa:300,af:0,ao:500,df:0,lb:0,ab:0},
  {n:"ادهم ياسين",no:"137",b:"سفيان",j:"كاش",fs:1068.57,ha:1568.16,la:0,aft:520,aa:300,af:340,ao:0,df:91.43,lb:0,ab:0},
  {n:"احمد قوصيني",no:"149",b:"سفيان",j:"صالة",fs:288.57,ha:535.84,la:0,aft:160,aa:300,af:0,ao:0,df:171.43,lb:0,ab:0},
  {n:"عبد الغني ترياقي",no:"164",b:"سفيان",j:"صالة",fs:664.29,ha:1455.84,la:0,aft:500,aa:200,af:0,ao:0,df:35.71,lb:0,ab:0},
  {n:"اسامة هندي",no:"165",b:"سفيان",j:"صالة",fs:800,ha:2177.12,la:0,aft:600,aa:200,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبد الجليل شولي",no:"166",b:"سفيان",j:"صالة",fs:388.57,ha:1039.84,la:0,aft:260,aa:200,af:0,ao:0,df:71.43,lb:0,ab:0},
  {n:"عز الدين زادة",no:"175",b:"سفيان",j:"مطبخ",fs:637.14,ha:1347.04,la:0,aft:280,aa:200,af:0,ao:300,df:142.86,lb:0,ab:0},
  {n:"يزن المصري",no:"241",b:"سفيان",j:"اداري",fs:1442.86,ha:1573.44,la:0,aft:500,aa:100,af:0,ao:1000,df:157.14,lb:0,ab:0},
  {n:"امجد شبيري",no:"244",b:"سفيان",j:"مطبخ",fs:600,ha:1463.2,la:0,aft:500,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"علاء ناصر",no:"261",b:"سفيان",j:"اداري",fs:1910,ha:2034.27,la:0,aft:800,aa:200,af:410,ao:500,df:0,lb:0,ab:0},
  {n:"منيب سويسة",no:"262",b:"سفيان",j:"مطبخ",fs:666.43,ha:1183.36,la:0,aft:300,aa:200,af:340,ao:0,df:173.57,lb:0,ab:0},
  {n:"عبد الوهاب عبده",no:"295",b:"سفيان",j:"صالة",fs:580,ha:1430.4,la:0,aft:480,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"حمزة خليل",no:"297",b:"سفيان",j:"مطبخ",fs:511.43,ha:1275.2,la:0,aft:440,aa:100,af:0,ao:0,df:28.57,lb:0,ab:0},
  {n:"محمد البنا",no:"299",b:"سفيان",j:"صالة",fs:640,ha:1796,la:0,aft:540,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"نصر الله الخراز",no:"300",b:"سفيان",j:"مطبخ",fs:0,ha:0,la:0,aft:0,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"شريف الشريف",no:"503",b:"سفيان",j:"صالة",fs:620,ha:1452.32,la:0,aft:520,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"سامح رماحة",no:"508",b:"سفيان",j:"امن",fs:646.07,ha:671.84,la:0,aft:300,aa:100,af:410,ao:0,df:163.93,lb:0,ab:0},
  {n:"يحيى جبر",no:"519",b:"سفيان",j:"مطبخ",fs:1080,ha:2050.24,la:0,aft:500,aa:100,af:480,ao:0,df:0,lb:0,ab:0},
  {n:"امير ناصر",no:"526",b:"سفيان",j:"صالة",fs:480,ha:1438.72,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"سارة إسكندر",no:"549",b:"سفيان",j:"محاسبة",fs:580,ha:1911.04,la:0,aft:580,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"وسيم صدر",no:"551",b:"سفيان",j:"اداري",fs:1040,ha:1687.2,la:0,aft:540,aa:0,af:0,ao:500,df:0,lb:0,ab:0},
  {n:"فراس الشريف",no:"552",b:"سفيان",j:"كاش",fs:580,ha:1722.88,la:0,aft:580,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"محمد عنبتاوي",no:"554",b:"سفيان",j:"مطبخ",fs:0,ha:643.4,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"تامر ترابي",no:"555",b:"سفيان",j:"مطبخ",fs:520,ha:1411.52,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عمار نصار",no:"561",b:"سفيان",j:"مطبخ",fs:0,ha:1279.52,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"فادي ميالة",no:"573",b:"سفيان",j:"اداري",fs:0,ha:325.12,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"امير شتية",no:"575",b:"سفيان",j:"مطبخ",fs:0,ha:0,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد سركجي",no:"544",b:"سفيان",j:"مطبخ",fs:520,ha:1520.32,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"محمود بيطار",no:"547",b:"سفيان",j:"امن",fs:460,ha:954.88,la:0,aft:460,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"هادي طبعوني",no:"205",b:"سفيان",j:"مطبخ",fs:435.71,ha:1247.36,la:0,aft:300,aa:200,af:0,ao:0,df:64.29,lb:0,ab:0},
  {n:"اياد البزرة",no:"",b:"سفيان",j:"اداري",fs:2780,ha:2420,la:0,aft:600,aa:200,af:480,ao:1500,df:0,lb:0,ab:0},
  {n:"عبد الله صايمة",no:"",b:"سفيان",j:"اداري",fs:400,ha:3000,la:0,aft:0,aa:400,af:300,ao:0,df:0,lb:0,ab:0},

  // ═══════════════ فرع فيصل ═══════════════
  {n:"حذيفة غزال",no:"99",b:"فيصل",j:"مطبخ",fs:1187.14,ha:1345.6,la:0,aft:480,aa:400,af:0,ao:500,df:192.86,lb:600,ab:0},
  {n:"مجاهد شخشير",no:"106",b:"فيصل",j:"مطبخ",fs:1380,ha:1564.32,la:0,aft:480,aa:600,af:0,ao:300,df:0,lb:600,ab:0},
  {n:"حسام شخشير",no:"108",b:"فيصل",j:"صالة",fs:1100,ha:1972.32,la:0,aft:500,aa:600,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عاصم مخلوف",no:"113",b:"فيصل",j:"كاش",fs:1330,ha:1758.72,la:0,aft:520,aa:400,af:410,ao:0,df:0,lb:0,ab:0},
  {n:"مصعب قطب",no:"116",b:"فيصل",j:"صالة",fs:850.71,ha:1514.72,la:0,aft:440,aa:500,af:0,ao:0,df:89.29,lb:0,ab:0},
  {n:"محمد السايح",no:"118",b:"فيصل",j:"اداري",fs:2410,ha:1943.2,la:0,aft:540,aa:600,af:270,ao:1000,df:0,lb:0,ab:0},
  {n:"حمزة عبد المجيد",no:"139",b:"فيصل",j:"مطبخ",fs:671.07,ha:770.4,la:0,aft:240,aa:300,af:410,ao:0,df:278.93,lb:625,ab:0},
  {n:"عبد الرحمن عليوي",no:"145",b:"فيصل",j:"صالة",fs:319.29,ha:651.2,la:0,aft:180,aa:300,af:0,ao:0,df:160.71,lb:0,ab:0},
  {n:"احمد جابر",no:"163",b:"فيصل",j:"صالة",fs:637.14,ha:1161.28,la:0,aft:480,aa:200,af:0,ao:0,df:42.86,lb:650,ab:0},
  {n:"نايف شهاب",no:"178",b:"فيصل",j:"مطبخ",fs:860,ha:1721.28,la:0,aft:460,aa:200,af:200,ao:0,df:0,lb:0,ab:0},
  {n:"محمد دويكات",no:"183",b:"فيصل",j:"مطبخ",fs:759.29,ha:1450.88,la:0,aft:280,aa:200,af:410,ao:0,df:130.71,lb:0,ab:0},
  {n:"واصف طوقان",no:"197",b:"فيصل",j:"اداري",fs:1520,ha:1546.72,la:0,aft:480,aa:200,af:340,ao:500,df:0,lb:0,ab:0},
  {n:"حسني الصلاج",no:"199",b:"فيصل",j:"امن",fs:1230,ha:1455.68,la:0,aft:480,aa:200,af:550,ao:0,df:0,lb:0,ab:0},
  {n:"رانية قتلوني",no:"213",b:"فيصل",j:"صالة",fs:450,ha:1432.96,la:0,aft:300,aa:200,af:0,ao:0,df:50,lb:0,ab:0},
  {n:"تالا حميض",no:"214",b:"فيصل",j:"كاش",fs:442.86,ha:1311.52,la:0,aft:300,aa:200,af:0,ao:0,df:57.14,lb:0,ab:0},
  {n:"محمود الداموني",no:"221",b:"فيصل",j:"صالة",fs:307.14,ha:883.68,la:0,aft:200,aa:200,af:0,ao:0,df:92.86,lb:0,ab:0},
  {n:"جهاد الخليلي",no:"242",b:"فيصل",j:"مطبخ",fs:344.29,ha:990.08,la:0,aft:280,aa:100,af:0,ao:0,df:35.71,lb:0,ab:0},
  {n:"عبد الله كوتة",no:"296",b:"فيصل",j:"مطبخ",fs:660,ha:2091.52,la:0,aft:560,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"مراد ابو غضيب",no:"298",b:"فيصل",j:"كاش",fs:230,ha:764.32,la:0,aft:180,aa:100,af:0,ao:0,df:50,lb:0,ab:0},
  {n:"ابراهيم شموط",no:"308",b:"فيصل",j:"مطبخ",fs:560,ha:1637.44,la:0,aft:460,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"حمزة السخلة",no:"506",b:"فيصل",j:"مطبخ",fs:538.57,ha:1389.6,la:0,aft:460,aa:100,af:0,ao:0,df:21.43,lb:500,ab:0},
  {n:"صبيح شالو",no:"507",b:"فيصل",j:"مطبخ",fs:558.57,ha:1302.72,la:0,aft:480,aa:100,af:0,ao:0,df:21.43,lb:0,ab:0},
  {n:"محمد حبش",no:"516",b:"فيصل",j:"صالة",fs:320.71,ha:1124,la:0,aft:260,aa:100,af:0,ao:0,df:39.29,lb:0,ab:0},
  {n:"محمد عرندي",no:"527",b:"فيصل",j:"صالة",fs:480,ha:1424.64,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد بسطامي",no:"529",b:"فيصل",j:"صالة",fs:440,ha:1241.6,la:0,aft:440,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عمر الجدي",no:"530",b:"فيصل",j:"مطبخ",fs:520,ha:2005.28,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ايهم حشاش",no:"539",b:"فيصل",j:"صالة",fs:280,ha:1116.16,la:0,aft:280,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ترتيل دنديس",no:"548",b:"فيصل",j:"كاش",fs:520,ha:1546.08,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"هيثم ابو صالحة",no:"550",b:"فيصل",j:"مطبخ",fs:500,ha:1527.52,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ثائر شلبي",no:"553",b:"فيصل",j:"مطبخ",fs:280,ha:1014.72,la:0,aft:280,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عمران رداد",no:"556",b:"فيصل",j:"كاش",fs:0,ha:1430.4,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبد الرحمن عيد",no:"558",b:"فيصل",j:"مطبخ",fs:0,ha:1269.44,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد دويكات",no:"559",b:"فيصل",j:"صالة",fs:0,ha:1398.24,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"شريف هواش",no:"560",b:"فيصل",j:"صالة",fs:0,ha:1163.68,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"جهاد جاموس",no:"562",b:"فيصل",j:"كاونتر",fs:0,ha:1598.72,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"يسرى ادعيس",no:"563",b:"فيصل",j:"كول سنتر",fs:0,ha:1232.32,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"صهيب سليمان",no:"564",b:"فيصل",j:"صالة",fs:0,ha:1525.28,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عمر جاموس",no:"565",b:"فيصل",j:"كاونتر",fs:0,ha:1486.56,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد هندية",no:"567",b:"فيصل",j:"مطبخ",fs:0,ha:980.48,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"اية دنديس",no:"568",b:"فيصل",j:"كول سنتر",fs:0,ha:1424,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"هيا صوصة",no:"569",b:"فيصل",j:"كول سنتر",fs:0,ha:645.76,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد طوقان",no:"570",b:"فيصل",j:"كاش",fs:0,ha:880.48,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ايمان جعفر",no:"571",b:"فيصل",j:"كاش",fs:0,ha:842.24,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"هالة حسون",no:"572",b:"فيصل",j:"كول سنتر",fs:0,ha:634.08,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"لين الشيخ عبد الله",no:"1018",b:"فيصل",j:"كاش",fs:500,ha:1280.32,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد حسين",no:"1059",b:"فيصل",j:"مطبخ",fs:280,ha:1071.04,la:0,aft:280,aa:0,af:0,ao:0,df:0,lb:0,ab:294},
  {n:"محمد بشارات",no:"",b:"فيصل",j:"اداري",fs:0,ha:2000,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"مهدي سليم",no:"",b:"فيصل",j:"اداري",fs:0,ha:2000,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"محمد الشريف",no:"",b:"فيصل",j:"اداري",fs:0,ha:1200,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:2547},

  // ═══════════════ فرع المركزي ═══════════════
  {n:"معاذ قطب",no:"62",b:"المركزي",j:"مطبخ",fs:1460,ha:3141.6,la:0,aft:460,aa:600,af:0,ao:400,df:0,lb:0,ab:0},
  {n:"هاني نصار",no:"93",b:"المركزي",j:"مطبخ",fs:1980,ha:2624,la:0,aft:600,aa:400,af:480,ao:500,df:0,lb:0,ab:0},
  {n:"علي السقا",no:"500",b:"المركزي",j:"مطبخ",fs:620,ha:3164.48,la:0,aft:520,aa:100,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عماد بزرة",no:"521",b:"المركزي",j:"مطبخ",fs:1120,ha:1468,la:0,aft:540,aa:100,af:480,ao:0,df:0,lb:0,ab:0},
  {n:"حمزة فضة",no:"522",b:"المركزي",j:"مطبخ",fs:600,ha:2258.24,la:38.4,aft:600,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبادة قط",no:"536",b:"المركزي",j:"مطبخ",fs:791.43,ha:1632.01,la:0,aft:500,aa:0,af:340,ao:0,df:48.57,lb:0,ab:0},
  {n:"نمر هندي",no:"574",b:"المركزي",j:"مطبخ",fs:0,ha:253.6,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},

  // ═══════════════ فرع الطيرة ═══════════════
  {n:"احمد ملحم",no:"1005",b:"الطيرة",j:"مشروبات",fs:0,ha:2803.25,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"مؤمن جعاريم",no:"1010",b:"الطيرة",j:"صالة",fs:180,ha:710.4,la:0,aft:180,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبد الجواد جبريل",no:"1011",b:"الطيرة",j:"مطبخ",fs:872.86,ha:1444.32,la:0,aft:480,aa:0,af:0,ao:500,df:107.14,lb:0,ab:0},
  {n:"حمزة مخالفة",no:"1013",b:"الطيرة",j:"مطبخ",fs:820,ha:1828.48,la:0,aft:480,aa:0,af:340,ao:0,df:0,lb:0,ab:0},
  {n:"ادم نوفل",no:"1014",b:"الطيرة",j:"مطبخ",fs:980,ha:1990.88,la:0,aft:480,aa:0,af:0,ao:500,df:0,lb:0,ab:0},
  {n:"هيثم ابو عابد",no:"1016",b:"الطيرة",j:"كاونتر",fs:440,ha:1807.84,la:0,aft:440,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبد الله طنينة",no:"1017",b:"الطيرة",j:"كاونتر",fs:300,ha:1084.64,la:0,aft:300,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"انس ابو صلاح",no:"1019",b:"الطيرة",j:"كاونتر",fs:300,ha:612.8,la:0,aft:200,aa:0,af:200,ao:0,df:100,lb:0,ab:256},
  {n:"عمرو اعمير",no:"1026",b:"الطيرة",j:"صالة",fs:710,ha:1908.64,la:0,aft:440,aa:0,af:270,ao:0,df:0,lb:0,ab:0},
  {n:"ادهم قرارية",no:"1028",b:"الطيرة",j:"مطبخ",fs:300,ha:1789.44,la:0,aft:300,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"شريف جمعة",no:"1031",b:"الطيرة",j:"مطبخ",fs:500,ha:1930.4,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:290},
  {n:"بسملة أبو كويك",no:"1035",b:"الطيرة",j:"محاسبة",fs:460,ha:1477.92,la:0,aft:460,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"أسامة علان",no:"1040",b:"الطيرة",j:"مطبخ",fs:300,ha:1119.36,la:0,aft:300,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"محمد عبيات",no:"1042",b:"الطيرة",j:"مطبخ",fs:480,ha:1379.2,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ميسم يحيى",no:"1044",b:"الطيرة",j:"كاش",fs:500,ha:1839.2,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"علاء الدين وادي",no:"1046",b:"الطيرة",j:"كاونتر",fs:542.86,ha:1234.72,la:0,aft:300,aa:0,af:340,ao:0,df:97.14,lb:0,ab:0},
  {n:"انس حجاج",no:"1048",b:"الطيرة",j:"اداري",fs:1540,ha:2396.96,la:0,aft:540,aa:0,af:0,ao:1000,df:0,lb:0,ab:0},
  {n:"نائل أبو علي",no:"1051",b:"الطيرة",j:"كاونتر",fs:480,ha:1862.72,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عمر ضبابات",no:"1062",b:"الطيرة",j:"كاونتر",fs:440,ha:1583.52,la:0,aft:440,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ابراهيم قيسية",no:"1063",b:"الطيرة",j:"صالة",fs:280,ha:1612,la:0,aft:280,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عثمان الاحمد",no:"1064",b:"الطيرة",j:"مطبخ",fs:500,ha:1585.6,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"احمد ابو صلاح",no:"1068",b:"الطيرة",j:"كاش",fs:200,ha:732.32,la:0,aft:200,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"نور طنينة",no:"1071",b:"الطيرة",j:"مطبخ",fs:500,ha:1374.08,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"انس جوابرة",no:"1072",b:"الطيرة",j:"كاونتر",fs:520,ha:1856.64,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"لطفي العيسي",no:"1073",b:"الطيرة",j:"مطبخ",fs:460,ha:1670.56,la:0,aft:460,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"سامر فيالة",no:"1076",b:"الطيرة",j:"مطبخ",fs:480,ha:1641.92,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"سمير حاج مير",no:"1077",b:"الطيرة",j:"اداري",fs:1520,ha:1870.08,la:0,aft:520,aa:0,af:0,ao:1000,df:0,lb:0,ab:0},
  {n:"محمد حسين",no:"1078",b:"الطيرة",j:"صالة",fs:300,ha:1172.48,la:0,aft:300,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"طارق سدر",no:"1079",b:"الطيرة",j:"اداري",fs:540,ha:2376,la:0,aft:540,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"غسان مرشود",no:"1080",b:"الطيرة",j:"مطبخ",fs:220,ha:996.32,la:0,aft:220,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"المعتصم بالله عناتي",no:"1081",b:"الطيرة",j:"كاونتر",fs:500,ha:1760,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"ممدوح ابو كرش",no:"1083",b:"الطيرة",j:"صالة",fs:500,ha:1961.28,la:0,aft:500,aa:0,af:0,ao:0,df:0,lb:0,ab:78},
  {n:"حنين القيسي",no:"1084",b:"الطيرة",j:"كاش",fs:480,ha:1359.52,la:0,aft:480,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"محي الدين العبيات",no:"1085",b:"الطيرة",j:"مطبخ",fs:0,ha:1668.16,la:0,aft:0,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"سامح ملحم",no:"1086",b:"الطيرة",j:"مطبخ",fs:280,ha:1012.64,la:0,aft:280,aa:0,af:0,ao:0,df:0,lb:0,ab:69},
  {n:"عمر ذيبة",no:"1087",b:"الطيرة",j:"صالة",fs:520,ha:1270.88,la:0,aft:520,aa:0,af:0,ao:0,df:0,lb:0,ab:0},
  {n:"عبادة اشتية",no:"533",b:"الطيرة",j:"كاش",fs:1040,ha:2476.48,la:0,aft:740,aa:0,af:0,ao:300,df:0,lb:0,ab:0},
];

const BRANCHES = ["سفيان", "فيصل", "المركزي", "الطيرة"];

// Stats
const loanCount = MALAKY_EMPLOYEES.filter(e => e.lb > 0).length;
const advanceCount = MALAKY_EMPLOYEES.filter(e => e.ab > 0).length;
const mixedCount = MALAKY_EMPLOYEES.filter(e => e.fs > 0 && e.ha > 0).length
  + MALAKY_EMPLOYEES.filter(e => e.fs > 0 && e.ha === 0).length
  + MALAKY_EMPLOYEES.filter(e => e.fs === 0 && e.ha > 0).length;

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
      for (const bName of BRANCHES) {
        const { data: existing } = await supabase
          .from("branches")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", bName)
          .maybeSingle();

        if (existing) {
          branchMap[bName] = existing.id;
        } else {
          const { data: created } = await supabase
            .from("branches")
            .insert({
              user_id: user.id,
              name: bName,
              latitude: 32.22,
              longitude: 35.26,
              radius_meters: 200,
            })
            .select("id")
            .single();
          if (created) branchMap[bName] = created.id;
        }
      }

      // 2. Import employees
      for (let i = 0; i < MALAKY_EMPLOYEES.length; i++) {
        const emp = MALAKY_EMPLOYEES[i];
        setCurrent(i + 1);

        // Check duplicate
        const { data: exists } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("full_name", emp.n.trim())
          .maybeSingle();

        if (exists) {
          res.skipped++;
          continue;
        }

        // Determine salary type
        const salaryType = emp.fs > 0 && emp.ha > 0
          ? "شهري"
          : emp.fs > 0 ? "شهري" : "بالساعة";

        // Insert employee
        const { data: newEmp, error } = await supabase
          .from("employees")
          .insert({
            user_id: user.id,
            full_name: emp.n.trim(),
            id_number: emp.no || null,
            branch_id: branchMap[emp.b] || null,
            job_title: emp.j,
            department: emp.j,
            base_salary: emp.fs || 0,
            salary_type: salaryType,
            contract_type: "دائم",
            is_active: true,
            start_date: "2023-01-01",
            notes: `مستورد من كشف رواتب فبراير 2026${emp.no ? ` | رقم: ${emp.no}` : ""}`,
          } as any)
          .select("id")
          .single();

        if (error || !newEmp) {
          res.failed.push({ name: emp.n, error: error?.message || "Unknown error" });
          continue;
        }

        // Insert allowances (non-zero only)
        const allowances = [
          { allowance_name: "علاوة أكل ومواصلات", amount: emp.aft },
          { allowance_name: "علاوة سنوية", amount: emp.aa },
          { allowance_name: "علاوة الزوجة والأبناء", amount: emp.af },
          { allowance_name: "علاوات أخرى", amount: emp.ao },
          { allowance_name: "بدل دوام إجازات", amount: emp.la },
        ].filter(a => a.amount > 0);

        if (allowances.length > 0) {
          await supabase.from("employee_allowances").insert(
            allowances.map(a => ({
              allowance_name: a.allowance_name,
              amount: a.amount,
              allowance_type: "ثابت",
              employee_id: newEmp.id,
              user_id: user.id,
              is_active: true,
            }))
          );
        }

        // Fixed monthly deduction
        if (emp.df > 0) {
          await supabase.from("employee_deductions").insert({
            employee_id: newEmp.id,
            user_id: user.id,
            deduction_type: "خصم ثابت شهري",
            amount: emp.df,
            description: "خصم ثابت — مستورد من كشف فبراير 2026",
            status: "معتمد للخصم",
          } as any);
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
          <h1 className="text-xl font-bold text-foreground">استيراد موظفي الملكي — فبراير 2026</h1>
          <p className="text-xs text-muted-foreground">استيراد 133 موظف من كشف الرواتب النهائي</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <Card className="p-3 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{mixedCount}</p>
          <p className="text-[10px] text-muted-foreground">راتب مختلط</p>
        </Card>
      </div>

      {/* Action buttons */}
      {!done && (
        <div className="flex gap-3">
          <Button
            variant="accent"
            size="lg"
            className="flex-1 gap-2 text-base"
            onClick={startImport}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            {importing ? "جاري الاستيراد..." : "▶ بدء الاستيراد"}
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
            تمت عملية الاستيراد
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-accent-foreground font-medium">✅ تم استيراد {results.success} موظف بنجاح</p>
            {results.skipped > 0 && (
              <p className="text-muted-foreground">⚠️ تم تخطي {results.skipped} موظف (موجود مسبقاً)</p>
            )}
            {results.loans > 0 && (
              <p className="text-primary">🏦 {results.loans} موظفون مع قرض حسن — راجع صفحة السلف</p>
            )}
            {results.advances > 0 && (
              <p className="text-primary">💸 {results.advances} موظفون مع رصيد سلف مفتوح</p>
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
            <DialogTitle>معاينة بيانات {total} موظف</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">رقم</TableHead>
                  <TableHead className="text-right">الفرع</TableHead>
                  <TableHead className="text-right">الوظيفة</TableHead>
                  <TableHead className="text-right">ثابت</TableHead>
                  <TableHead className="text-right">ساعات</TableHead>
                  <TableHead className="text-right">علاوات</TableHead>
                  <TableHead className="text-right">خصم</TableHead>
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
                    <TableCell className="text-xs">{e.j}</TableCell>
                    <TableCell className="text-xs">{e.fs > 0 ? e.fs.toFixed(0) : "-"}</TableCell>
                    <TableCell className="text-xs">{e.ha > 0 ? e.ha.toFixed(0) : "-"}</TableCell>
                    <TableCell className="text-xs">{(e.aft + e.aa + e.af + e.ao) || "-"}</TableCell>
                    <TableCell className="text-xs text-destructive">{e.df > 0 ? e.df.toFixed(0) : "-"}</TableCell>
                    <TableCell className="text-xs">{e.lb > 0 ? e.lb : "-"}</TableCell>
                    <TableCell className="text-xs">{e.ab > 0 ? e.ab : "-"}</TableCell>
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
