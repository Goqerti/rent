// server.js — V2 (Hər Günü Ayrı İdarəetmə)
const fs = require('fs');
const path = require('path');
const express = require('express');
require('dotenv/config');
const cors = require('cors');
const multer = require('multer');
const { nanoid } = require('nanoid');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const fetch = require('node-fetch');
const cron = require('node-cron');

// ----- Setup -----
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
const DEFAULT_TZ = 'Asia/Baku';

const PORT = process.env.PORT || 3001;

// Paths
const DB_DIR = path.join(__dirname, 'db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
for (const d of [DB_DIR, PUBLIC_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// ----- DB file paths -----
const carsPath         = path.join(DB_DIR, 'cars.json');
const customersPath    = path.join(DB_DIR, 'customers.json');
const reservationsPath = path.join(DB_DIR, 'reservations.json');
const usersPath        = path.join(DB_DIR, 'users.json');
const carExpensesPath   = path.join(DB_DIR, 'car_expenses.json');
const adminExpensesPath = path.join(DB_DIR, 'admin_expenses.json');
const officeIncidentsPath = path.join(DB_DIR, 'office_incidents.json');
const finesPath = path.join(DB_DIR, 'fines.json');
const incomesPath = path.join(DB_DIR, 'incomes.json');

for (const p of [carsPath, customersPath, reservationsPath, usersPath, carExpensesPath, adminExpensesPath, officeIncidentsPath, finesPath, incomesPath]) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf8');
}

// ----- Köməkçi Funksiyalar (Helpers) -----
function readJsonSafe(p, fallback=[]) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) { console.error('readJsonSafe error for', p, e); return fallback; }
}
function writeJsonSafe(p, data){
  try {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch (e) { console.error('writeJsonSafe error for', p, e); }
}
function toMs(x) { const d = new Date(x); return isNaN(+d) ? null : +d; }
function rangeOverlap(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; }

function daysBetweenInclusive(startISO, endISO, tz=DEFAULT_TZ){
  const s = dayjs.tz(startISO, tz).startOf('day');
  const e = dayjs.tz(endISO, tz).startOf('day');
  
  // ==================================
  // DÜZƏLİŞ 1: Gün hesablama məntiqi (Artıq "+ 1" yoxdur)
  // Bu, 31-dən 2-nə olan fərqi "2 gün" olaraq hesablayır.
  const diff = e.diff(s, 'day');
  return diff <= 0 ? 1 : diff;
  // ==================================
}

// === V1 datanı V2-yə çevirən funksiya ===
function convertV1ReservationToV2(reservation) {
    if (!reservation || (reservation.days && Array.isArray(reservation.days))) {
        return reservation; // Artıq V2 formatındadırsa, toxunma
    }

    console.warn(`Köhnə V1 rezervasiyası tapıldı (${reservation.id}). V2 formasına çevrilir...`);
    
    const dailyBreakdown = [];
    // Düzəldilmiş `daysBetweenInclusive` funksiyasını istifadə edir
    const daysCount = Number(reservation.days) || daysBetweenInclusive(reservation.startAt, reservation.endAt);
    const unitPrice = reservation.pricePerDay || (reservation.totalPrice / daysCount) || 0;
    
    for (let i = 0; i < daysCount; i++) {
        const currentDate = dayjs.tz(reservation.startAt, 'Asia/Baku').add(i, 'day').format('YYYY-MM-DD');
        dailyBreakdown.push({
            date: currentDate,
            price: unitPrice,
            paid: 0,
            status: 'unpaid',
            notes: '[Köhnə sistemdən köçürülüb]'
        });
    }

    if (reservation.amountPaid > 0) {
        let remainingPaid = reservation.amountPaid;
        for (let day of dailyBreakdown) {
            if (remainingPaid <= 0) break;
            if (remainingPaid >= day.price) {
                day.paid = day.price;
                day.status = 'paid';
                remainingPaid -= day.price;
            } else {
                day.paid = remainingPaid;
                day.status = 'partial';
                remainingPaid = 0;
            }
        }
    }
    
    reservation.days = dailyBreakdown;
    
    const allReservations = readJsonSafe(reservationsPath);
    const index = allReservations.findIndex(r => r.id === reservation.id);
    if (index !== -1) {
        allReservations[index] = reservation;
        writeJsonSafe(reservationsPath, allReservations);
    }
    
    return reservation;
}

function recalculateReservationTotals(reservation) {
    if (!reservation || !reservation.days || !Array.isArray(reservation.days)) {
        return convertV1ReservationToV2(reservation);
    }
    
    let totalPrice = 0;
    let amountPaid = 0;
    
    reservation.days.forEach(day => {
        totalPrice += Number(day.price || 0);
        amountPaid += Number(day.paid || 0);
    });

    reservation.totalPrice = totalPrice;
    reservation.amountPaid = amountPaid;

    if (totalPrice > 0 && amountPaid >= totalPrice) {
        reservation.isPaid = true;
    } else {
        reservation.isPaid = false;
    }
    return reservation;
}

function computeCarStatus(carId, reservations){
  const cars = readJsonSafe(carsPath);
  const car = cars.find(c => c.id === carId);
  if (car && car.status === 'SERVICE') {
      return 'SERVICE';
  }

  const activeReservations = reservations.filter(r => 
      r.carId === carId && 
      !['COMPLETED', 'CANCELED'].includes(String(r.status || '').toUpperCase())
  );

  if (activeReservations.length > 0) {
      return 'RESERVED';
  }

  return 'FREE';
}
function hasOverlap(reservations, carId, startAt, endAt, ignoreId=null){
  const s = toMs(startAt), e = toMs(endAt);
  if (s==null || e==null) return false;
  for (const r of reservations) {
    if (r.carId !== carId) continue;
    if (ignoreId && r.id === ignoreId) continue;
    
    if (['CANCELED', 'COMPLETED'].includes(String(r.status || '').toUpperCase())) continue;
    
    if (r.days && r.days.length > 0) {
        const firstDay = r.days[0].date;
        const lastDay = r.days[r.days.length - 1].date;
        // Bitmə gününü saymırıq (overlap yoxlaması üçün)
        const endMs = toMs(dayjs(lastDay).add(1, 'day')); 
        if (rangeOverlap(s, e, toMs(firstDay), endMs)) return true;
    }
  }
  return false;
}

// ===== TELEGRAM BİLDİRİŞ FUNKSİYASI =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || '';
const tgEscape = (s='') => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function sendTelegram(messageHtml){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram token/chat ID təyin edilməyib, bildiriş göndərilmir.");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: messageHtml, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    
    const result = await response.json();
    if (result.ok) {
        console.log("Telegram bildirişi uğurla göndərildi.");
    } else {
        console.error('Telegram API xətası:', result.description);
    }
  } catch(e) { 
      console.error('Telegram bildiriş xətası (Network/Fetch):', e?.message || e); 
  }
}

// ===== GÜNLÜK HESABAT FUNKSİYASI (V2-yə uyğunlaşdırılmalıdır) =====
async function sendDailySummary() {
    console.log("Gündəlik hesabat hazırlanır...");
    
    const today = dayjs().tz(DEFAULT_TZ).subtract(1, 'day');
    const dateString = today.format('YYYY-MM-DD');
    const reportDateStr = today.format('DD.MM.YYYY');

    const reservations = readJsonSafe(reservationsPath).map(recalculateReservationTotals);
    const adminExpensesData = readJsonSafe(adminExpensesPath);
    const carExpensesData = readJsonSafe(carExpensesPath);
    const fines = readJsonSafe(finesPath);
    const incomes = readJsonSafe(incomesPath);
    const customers = readJsonSafe(customersPath);
    const incidents = readJsonSafe(officeIncidentsPath);

    let resRevenue = 0;
    let newReservationsCount = 0;
    reservations.forEach(r => {
        if (!r.days || !Array.isArray(r.days)) return;
        
        let isNewReservation = r.createdAt && r.createdAt.startsWith(dateString);
        if(isNewReservation) newReservationsCount++;

        r.days.forEach(day => {
            if (day.paid > 0 && day.date.startsWith(dateString)) { 
                resRevenue += day.paid;
            }
        });
    });

    const newAdminExpenses = (adminExpensesData.items || adminExpensesData).filter(e => (e.when || e.createdAt).startsWith(dateString));
    const adminExpenseTotal = newAdminExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const newCarExpenses = (carExpensesData.items || carExpensesData).filter(e => (e.when || e.createdAt).startsWith(dateString));
    const carExpenseTotal = newCarExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const newFines = fines.filter(f => f.date.startsWith(dateString));
    let finesRevenue = 0;
    newFines.forEach(f => {
        if (f.isPaid) { 
            finesRevenue += (f.amountPaid || f.amount || 0);
        }
    });

    const newIncomes = incomes.filter(i => i.date.startsWith(dateString));
    const incomeTotal = newIncomes.reduce((sum, i) => sum + (i.amount || 0), 0);

    const newCustomers = customers.filter(c => c.createdAt.startsWith(dateString));
    const newIncidents = incidents.filter(i => i.date.startsWith(dateString));

    const totalRevenue = resRevenue + finesRevenue + incomeTotal;
    const totalExpense = adminExpenseTotal + carExpenseTotal;
    const netProfit = totalRevenue - totalExpense;

    let message = `🗓️ <b>${tgEscape(reportDateStr)} üçün Günlük Hesabat (V2)</b> 🗓️\n\n`;
    message += `<b><u>Maliyyə Yekunu:</u></b>\n`;
    message += `✅ Ümumi Gəlir (Real Mədaxil): <b>${totalRevenue.toFixed(2)} AZN</b>\n`;
    message += `  (Rezervasiya ödənişləri: ${resRevenue.toFixed(2)} AZN)\n`;
    message += `  (Ödənilmiş Cərimələr: ${finesRevenue.toFixed(2)} AZN)\n`;
    message += `  (Digər Mədaxil: ${incomeTotal.toFixed(2)} AZN)\n\n`;
    message += `🔻 Ümumi Xərc: <b>${totalExpense.toFixed(2)} AZN</b>\n`;
    message += `  (İnzibati: ${adminExpenseTotal.toFixed(2)} AZN)\n`;
    message += `  (Maşın xərcləri: ${carExpenseTotal.toFixed(2)} AZN)\n\n`;
    message += `💰 Xalis Mənfəət: <b>${netProfit.toFixed(2)} AZN</b>\n`;
    message += `------------------------------\n`;
    message += `<b><u>Günün Əməliyyatları:</u></b>\n`;
    message += `🚗 Yeni Rezervasiyalar: <b>${newReservationsCount} ədəd</b>\n`;
    message += `👤 Yeni Müştərilər: <b>${newCustomers.length} nəfər</b>\n`;
    message += `🚨 Yeni Cərimələr: <b>${newFines.length} ədəd</b>\n`;
    message += `🔔 Yeni Hadisələr: <b>${newIncidents.length} ədəd</b>\n`;
    message += `💰 Yeni Mədaxil: <b>${newIncomes.length} ədəd</b>\n`;

    await sendTelegram(message);
}

// ----- App -----
const app = express();
app.set('trust proxy', true);
app.use((req,res,next)=>{ console.log(req.method, req.url); next(); });
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/public', express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.redirect('/public/login.html'));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:   (_, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});
const upload = multer({ storage });


// ----- Auth -----
app.post('/api/auth/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const users = readJsonSafe(usersPath, []);
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'İstifadəçi adı və ya şifrə səhvdir' });
  res.json({ token: nanoid(24), user: { id: user.id, username: user.username, role: user.role } });
});
app.post('/api/auth/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: 'Bütün xanalar doldurulmalıdır.' });
    const users = readJsonSafe(usersPath, []);
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Bu istifadəçi adı artıq mövcuddur.' });
    const newUser = { id: `user_${nanoid(8)}`, username, password, role };
    users.push(newUser);
    writeJsonSafe(usersPath, users);
    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
});


// ===== CARS API =====
app.get('/api/cars', (req, res) => res.json(readJsonSafe(carsPath)));
app.post('/api/cars', (req, res) => {
    const list = readJsonSafe(carsPath);
    const now = new Date().toISOString();
    const car = { id: nanoid(12), ...req.body, status: 'FREE', createdAt: now, updatedAt: now };
    list.push(car);
    writeJsonSafe(carsPath, list);
    res.status(201).json(car);
});
app.patch('/api/cars/:id', (req, res) => {
    const list = readJsonSafe(carsPath);
    const i = list.findIndex(x => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'not_found' });
    
    const allowedStatuses = ['FREE', 'SERVICE'];
    let newStatus = req.body.status;
    if(newStatus && !allowedStatuses.includes(newStatus)) {
        newStatus = list[i].status; 
    }

    list[i] = { ...list[i], ...req.body, status: newStatus, updatedAt: new Date().toISOString() };
    writeJsonSafe(carsPath, list);
    res.json(list[i]);
});
app.delete('/api/cars/:id', (req, res) => {
    let list = readJsonSafe(carsPath);
    const initialLength = list.length;
    list = list.filter(c => c.id !== req.params.id);
    if(list.length === initialLength) return res.status(404).json({error: 'not_found'});
    writeJsonSafe(carsPath, list);
    res.json({ message: 'Deleted' });
});

// ===== CUSTOMERS API =====
app.get('/api/customers', (req, res) => {
    const list = readJsonSafe(customersPath);
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json(list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
    const filtered = list.filter(c => (c.firstName || '').toLowerCase().includes(q) || (c.lastName || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q));
    res.json(filtered);
});
app.post('/api/customers', upload.single('idCard'), (req, res) => {
    try {
        const list = readJsonSafe(customersPath);
        const now = new Date().toISOString();
        const item = {
            id: nanoid(12),
            firstName: req.body.firstName || '',
            lastName: req.body.lastName || '',
            phone: req.body.phone || '',
            email: req.body.email || '',
            idCardPath: req.file ? `/public/uploads/${req.file.filename}` : null,
            notes: "", 
            isBlacklisted: false,
            createdAt: now,
            updatedAt: now,
        };
        if (!item.firstName || !item.lastName) {
            console.error("Serverə boş məlumat gəldi:", req.body);
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Ad və Soyad daxil edilməyib.' });
        }
        list.push(item);
        writeJsonSafe(customersPath, list);
        res.status(201).json(item);
    } catch (error) {
        console.error("Müştəri əlavə edərkən xəta:", error);
        res.status(500).json({ error: "Serverdə daxili xəta baş verdi." });
    }
});
app.patch('/api/customers/:id', (req, res) => {
    const { notes, isBlacklisted } = req.body;
    let list = readJsonSafe(customersPath);
    const index = list.findIndex(c => c.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Müştəri tapılmadı' });
    }

    if (notes !== undefined) {
        list[index].notes = notes;
    }
    if (isBlacklisted !== undefined) {
        list[index].isBlacklisted = isBlacklisted;
    }
    list[index].updatedAt = new Date().toISOString();
    
    writeJsonSafe(customersPath, list);
    res.json(list[index]);
});
app.delete('/api/customers/:id', (req, res) => {
    let list = readJsonSafe(customersPath);
    const initialLength = list.length;
    list = list.filter(c => c.id !== req.params.id);
    if(list.length === initialLength) return res.status(404).json({error: 'not_found'});
    writeJsonSafe(carsPath, list);
    res.json({ message: 'Deleted' });
});
app.get('/api/document/:customerId', (req, res) => {
    const customers = readJsonSafe(customersPath);
    const customer = customers.find(c => c.id === req.params.customerId);
    if (customer && customer.idCardPath) {
        res.redirect(customer.idCardPath);
    } else {
        res.status(404).send('Sənəd tapılmadı.');
    }
});


// ===== RESERVATIONS API (V2) =====
app.get('/api/reservations', (req, res)=> {
    const { customerId } = req.query;
    let list = readJsonSafe(reservationsPath);
    if (customerId) {
        list = list.filter(r => r.customerId === customerId);
    }
    list = list.map(recalculateReservationTotals);
    res.json(list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/reservations/:id', (req, res) => {
    const list = readJsonSafe(reservationsPath);
    let reservation = list.find(r => r.id === req.params.id);
    if (!reservation) {
        return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    }
    reservation = recalculateReservationTotals(reservation);
    res.json(reservation);
});

app.post('/api/reservations/check', (req, res)=> {
  try {
    const { carId, startAt, endAt, ignoreId } = req.body || {};
    const reservations = readJsonSafe(reservationsPath);
    const overlap = hasOverlap(reservations, String(carId||''), startAt, endAt, ignoreId || null);
    res.json({ overlap });
  } catch (error) {
    console.error("Error in /api/reservations/check:", error);
    res.status(500).json({ error: 'Daxili server xətası', message: error.message });
  }
});

app.post('/api/reservations', (req, res) => {
    const { carId, customerId, startAt, endAt, pricePerDay, discountPercent=0, destination='', deposit=0 } = req.body;
    if (!carId || !customerId || !startAt || !endAt) return res.status(400).json({ error: 'Məcburi xanalar boşdur' });
    
    let reservations = readJsonSafe(reservationsPath);
    if (hasOverlap(reservations, carId, startAt, endAt, null)) return res.status(409).json({ error:'overlap', message:'Bu maşın seçilən tarixlərdə artıq rezerv edilib.' });
    
    const cars = readJsonSafe(carsPath);
    const car = cars.find(x=>x.id===carId) || {};
    const unitPrice = Number(pricePerDay ?? car?.basePricePerDay ?? 0);
    const daysCount = daysBetweenInclusive(startAt, endAt, DEFAULT_TZ); // <-- DÜZƏLDİLMİŞ FUNKSİYANİ İSTİFADƏ EDİR
    const discountAmount = 1 - Number(discountPercent || 0) / 100;
    
    const dailyBreakdown = [];
    // `daysCount` artıq düzgün olduğu üçün (məs. 2), loop yalnız 31 Okt və 1 Noyabr üçün işləyəcək.
    for (let i = 0; i < daysCount; i++) { 
        const currentDate = dayjs.tz(startAt, DEFAULT_TZ).add(i, 'day').format('YYYY-MM-DD');
        dailyBreakdown.push({
            date: currentDate,
            price: unitPrice * discountAmount,
            paid: 0,
            status: 'unpaid',
            notes: ''
        });
    }

    const totalPrice = dailyBreakdown.reduce((sum, day) => sum + day.price, 0);

    const now = new Date().toISOString();
    const item = {
        id: nanoid(12), carId, customerId, 
        startAt: dayjs.tz(startAt, DEFAULT_TZ).format('YYYY-MM-DDTHH:mm'),
        endAt: dayjs.tz(endAt, DEFAULT_TZ).format('YYYY-MM-DDTHH:mm'),
        pricePerDay: unitPrice,
        discountPercent: Number(discountPercent||0),
        days: dailyBreakdown,
        totalPrice: totalPrice, 
        destination,
        deposit: Number(deposit || 0),
        status: 'BOOKED',
        isPaid: false,
        amountPaid: 0,
        notes: '',
        createdAt: now, updatedAt: now
    };

    reservations.push(item);
    writeJsonSafe(reservationsPath, reservations);
    
    const carIndex = cars.findIndex(c => c.id === carId);
    if (carIndex > -1) {
        cars[carIndex].status = computeCarStatus(carId, reservations);
        writeJsonSafe(carsPath, cars);
    }

    (async () => {
        const carInfo = readJsonSafe(carsPath).find(c => c.id === item.carId) || {};
        const customerInfo = readJsonSafe(customersPath).find(c => c.id === item.customerId) || {};
        const msg = `🚗 <b>Yeni Rezervasiya (V2)</b>
<b>Maşın:</b> ${tgEscape(carInfo.brand)} ${tgEscape(carInfo.model)} (${tgEscape(carInfo.plate)})
<b>Müştəri:</b> ${tgEscape(customerInfo.firstName)} ${tgEscape(customerInfo.lastName)}
<b>Tarixlər:</b> ${tgEscape(dayjs(item.startAt).format('DD.MM.YYYY'))} - ${tgEscape(dayjs(item.endAt).format('DD.MM.YYYY'))}
<b>Gün:</b> ${item.days.length} gün
<b>Cəmi Qiymət:</b> ${item.totalPrice} AZN`;
        await sendTelegram(msg);
    })();
    
    res.status(201).json(item);
});

// ==================================
// DÜZƏLİŞ 2: Təqvimdən YENİ GÜN ƏLAVƏ ETMƏ
// ==================================
app.patch('/api/reservations/day/:id', (req, res) => {
    const reservationId = req.params.id;
    const { daysToUpdate } = req.body; 

    if (!daysToUpdate || !Array.isArray(daysToUpdate) || daysToUpdate.length === 0) {
        return res.status(400).json({ error: 'Dəyişdiriləcək günlər göndərilməyib' });
    }
    
    let reservations = readJsonSafe(reservationsPath);
    const resIndex = reservations.findIndex(r => r.id === reservationId);
    if (resIndex === -1) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    
    let reservation = reservations[resIndex];
    
    daysToUpdate.forEach(updatedDay => {
        const dayIndex = reservation.days.findIndex(d => d.date === updatedDay.date);
        
        // Frontentdən gələn məlumatı təmizləyirik
        const newDayData = {
            date: updatedDay.date,
            price: Number(updatedDay.price || 0),
            paid: Number(updatedDay.paid || 0),
            status: updatedDay.status || 'unpaid',
            notes: updatedDay.notes || ''
        };

        // Statusu avtomatik təyin et
        if (newDayData.price <= 0) newDayData.status = 'free';
        else if (newDayData.paid >= newDayData.price) newDayData.status = 'paid';
        else if (newDayData.paid > 0 && newDayData.paid < newDayData.price) newDayData.status = 'partial';
        else newDayData.status = 'unpaid';

        if (dayIndex !== -1) {
            // GÜN ARTIQ VAR: Mövcud olanı yenilə
            const existingDay = reservation.days[dayIndex];
            reservation.days[dayIndex] = { ...existingDay, ...newDayData };
        } else {
            // YENİ GÜN: Rezervasiyaya əlavə et
            reservation.days.push(newDayData);
        }
    });

    // Günləri tarixə görə çeşidləyirik ki, cədvəl pozulmasın
    reservation.days.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Başlanğıc və bitmə tarixlərini yeniləyirik
    if (reservation.days.length > 0) {
        reservation.startAt = dayjs.tz(reservation.days[0].date, DEFAULT_TZ).format('YYYY-MM-DDTHH:mm');
        reservation.endAt = dayjs.tz(reservation.days[reservation.days.length - 1].date, DEFAULT_TZ).format('YYYY-MM-DDTHH:mm');
    }

    reservation = recalculateReservationTotals(reservation);
    reservation.updatedAt = new Date().toISOString();
    reservations[resIndex] = reservation;
    
    writeJsonSafe(reservationsPath, reservations);
    res.json(reservation);
});
// ==================================
// YENİLƏNMİŞ BLOKUN SONU
// ==================================


// V2: STATUS DƏYİŞMƏK ÜÇÜN
app.patch('/api/reservations/:id', (req, res) => {
    let list = readJsonSafe(reservationsPath);
    const i = list.findIndex(x=>x.id===req.params.id);
    if (i<0) return res.status(404).json({error:'not_found'});
    
    const oldRes = list[i];
    
    const updatedReservation = {
        ...oldRes,
        status: req.body.status !== undefined ? req.body.status : oldRes.status,
        notes: req.body.notes !== undefined ? req.body.notes : oldRes.notes,
        deposit: req.body.deposit !== undefined ? Number(req.body.deposit) : oldRes.deposit,
        updatedAt: new Date().toISOString()
    };
    
    list[i] = updatedReservation;
    writeJsonSafe(reservationsPath, list);
    
    const newCarStatus = computeCarStatus(updatedReservation.carId, list);
    const cars = readJsonSafe(carsPath);
    const newCarIndex = cars.findIndex(c=>c.id === updatedReservation.carId);
    if(newCarIndex > -1) {
        cars[newCarIndex].status = newCarStatus;
        writeJsonSafe(carsPath, cars);
    }
    
    res.json(updatedReservation);
});

// V2: REZERVASİYA UZATMAQ ÜÇÜN
app.post('/api/reservations/extend/:id', (req, res) => {
    const { daysToAdd, newPricePerDay, notes } = req.body;
    if (!daysToAdd || newPricePerDay === undefined) {
        return res.status(400).json({ error: 'Gün sayı və qiymət məcburidir.' });
    }
    
    let reservations = readJsonSafe(reservationsPath);
    const resIndex = reservations.findIndex(r => r.id === req.params.id);
    if (resIndex === -1) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    
    let reservation = reservations[resIndex];
    
    const lastDay = dayjs.tz(reservation.days[reservation.days.length - 1].date, DEFAULT_TZ);
    const newEndDate = lastDay.add(daysToAdd, 'day');
    
    if (hasOverlap(reservations, reservation.carId, lastDay.add(1, 'day').toISOString(), newEndDate.toISOString(), reservation.id)) {
        return res.status(409).json({ error: 'overlap', message: 'Uzatma üçün seçilən tarixlərdə maşın məşğuldur.' });
    }
    
    for (let i = 1; i <= daysToAdd; i++) {
        const newDate = lastDay.add(i, 'day').format('YYYY-MM-DD');
        reservation.days.push({
            date: newDate,
            price: Number(newPricePerDay),
            paid: 0,
            status: Number(newPricePerDay) <= 0 ? 'free' : 'unpaid',
            notes: notes || "[Uzatma]"
        });
    }
    
    reservation.endAt = newEndDate.format('YYYY-MM-DDTHH:mm');
    reservation = recalculateReservationTotals(reservation); 
    reservation.updatedAt = new Date().toISOString();
    
    reservations[resIndex] = reservation;
    writeJsonSafe(reservationsPath, reservations);
    
    (async () => {
        const carInfo = readJsonSafe(carsPath).find(c => c.id === reservation.carId) || {};
        const customerInfo = readJsonSafe(customersPath).find(c => c.id === reservation.customerId) || {};
        const msg = `🔄 <b>Rezervasiya Uzadıldı (V2)</b>
<b>Müştəri:</b> ${tgEscape(customerInfo.firstName)} ${tgEscape(customerInfo.lastName)}
<b>Maşın:</b> ${tgEscape(carInfo.brand)} ${tgEscape(carInfo.model)}
<b>Yeni Bitmə Tarixi:</b> ${tgEscape(newEndDate.format('DD.MM.YYYY'))}
<b>Əlavə Edilən Gün:</b> ${daysToAdd}
<b>Yeni Yekun Məbləğ:</b> ${reservation.totalPrice} AZN`;
        await sendTelegram(msg);
    })();
    
    res.json(reservation);
});


app.delete('/api/reservations/:id', (req, res) => {
    let list = readJsonSafe(reservationsPath);
    const i = list.findIndex(x=>x.id===req.params.id);
    if(i<0) return res.status(404).json({error: 'not_found'});
    const [deletedRes] = list.splice(i,1);
    writeJsonSafe(reservationsPath, list);
    
    const cars = readJsonSafe(carsPath);
    const carIndex = cars.findIndex(c=>c.id === deletedRes.carId);
    if(carIndex > -1){
        cars[carIndex].status = computeCarStatus(deletedRes.carId, list);
        writeJsonSafe(carsPath, cars);
    }
    res.json({message: 'Deleted'});
});

// ===== EXPENSES API =====
app.get('/api/admin-expenses', (req, res) => {
    const { month, day } = req.query;
    let data = readJsonSafe(adminExpensesPath);
    
    let items = data.items || data;

    if (day) {
        items = items.filter(x => (x.when || x.createdAt || '').startsWith(day));
    } else if (month) {
        items = items.filter(x => (x.when || x.createdAt || '').startsWith(month));
    }
    
    const total = items.reduce((s, x) => s + Number(x.amount || 0), 0);
    res.json({ items: items, total });
});

app.post('/api/admin-expenses', (req, res) => {
    let data = readJsonSafe(adminExpensesPath);
    let list;
    let isObject = false;
    
    if (data && Array.isArray(data.items)) {
        list = data.items;
        isObject = true;
    } 
    else if (Array.isArray(data)) {
        list = data;
    } 
    else {
        list = [];
        data = list;
    }

    const nowISO = new Date().toISOString();
    const item = { id: nanoid(12), ...req.body, amount: Number(req.body.amount||0), createdAt: nowISO, updatedAt: nowISO };
    list.push(item);

    if (isObject) {
        data.items = list;
        writeJsonSafe(adminExpensesPath, data);
    } else {
        writeJsonSafe(adminExpensesPath, list);
    }
    
    (async () => {
        const msg = `💸 <b>İnzibati Xərc</b>
<b>Təsvir:</b> ${tgEscape(item.title)}
<b>Məbləğ:</b> ${item.amount} AZN
<b>Tarix:</b> ${tgEscape(dayjs(item.when).format('DD.MM.YYYY'))}`;
        await sendTelegram(msg);
    })();

    res.status(201).json(item);
});

app.delete('/api/admin-expenses/:id', (req, res) => {
    let data = readJsonSafe(adminExpensesPath);
    let list;
    let isObject = false;

    if (data && Array.isArray(data.items)) {
        list = data.items;
        isObject = true;
    } else if (Array.isArray(data)) {
        list = data;
    } else {
        res.json({ message: 'Deleted' });
        return;
    }

    const initialLength = list.length;
    list = list.filter(e => e.id !== req.params.id);

    if (list.length < initialLength) {
         if (isObject) {
            data.items = list;
            writeJsonSafe(adminExpensesPath, data);
        } else {
            writeJsonSafe(adminExpensesPath, list);
        }
    }
   
    res.json({ message: 'Deleted' });
});

app.get('/api/car-expenses', (req, res) => {
    const { month, day, carId } = req.query;
    let data = readJsonSafe(carExpensesPath);
    let list = data.items || data;
    
    if (carId) list = list.filter(x => x.carId === carId);
    
    if (day) {
        list = list.filter(x => (x.when || x.createdAt || '').startsWith(day));
    } else if (month) {
        list = list.filter(x => (x.when || x.createdAt || '').startsWith(month));
    }

    const total = list.reduce((s, x) => s + Number(x.amount || 0), 0);
    res.json({ items: list, total, count: list.length });
});

app.post('/api/car-expenses', (req, res) => {
    let data = readJsonSafe(carExpensesPath);
    let list;
    let isObject = false;

    if (data && Array.isArray(data.items)) {
        list = data.items;
        isObject = true;
    } else if (Array.isArray(data)) {
        list = data;
    } else {
        list = [];
        data = list;
    }

    const nowISO = new Date().toISOString();
    const item = { id: nanoid(12), ...req.body, amount: Number(req.body.amount||0), createdAt: nowISO, updatedAt: nowISO };
    list.push(item);

    if (isObject) {
        data.items = list;
        writeJsonSafe(carExpensesPath, data);
    } else {
        writeJsonSafe(carExpensesPath, list);
    }

    (async () => {
        const car = readJsonSafe(carsPath).find(c => c.id === item.carId) || {};
        const msg = `🛠️ <b>Maşın Xərci</b>
<b>Maşın:</b> ${tgEscape(car.brand)} ${tgEscape(car.model)} (${tgEscape(car.plate)})
<b>Təsvir:</b> ${tgEscape(item.title)}
<b>Məbləğ:</b> ${item.amount} AZN`;
        await sendTelegram(msg);
    })();
    
    res.status(201).json(item);
});

app.delete('/api/car-expenses/:id', (req, res) => {
    let data = readJsonSafe(carExpensesPath);
    let list;
    let isObject = false;

    if (data && Array.isArray(data.items)) {
        list = data.items;
        isObject = true;
    } else if (Array.isArray(data)) {
        list = data;
    } else {
        res.status(404).json({ error: 'not_found' });
        return;
    }

    const initialLength = list.length;
    list = list.filter(e => e.id !== req.params.id);
    if (list.length === initialLength) return res.status(404).json({ error: 'not_found' });

    if (isObject) {
        data.items = list;
        writeJsonSafe(carExpensesPath, data);
    } else {
        writeJsonSafe(carExpensesPath, list);
    }
    
    res.json({ message: 'Deleted' });
});

// ===== REVENUE API (V2-yə uyğunlaşdırılmalıdır) =====
app.get('/api/revenue', (req, res)=> {
  try {
    const { month, day } = req.query;
    const reservations = readJsonSafe(reservationsPath);
    let items = [];
    
    if (day) {
        const targetDay = dayjs.tz(day, DEFAULT_TZ);
        reservations.forEach(r => {
            if(r.days && r.days.find(d => dayjs.tz(d.date, DEFAULT_TZ).isSame(targetDay, 'day'))) {
                items.push(r);
            }
        });
    } else {
        let start = dayjs.tz().startOf('month');
        let end = dayjs.tz().endOf('month');
        if (month) {
            const [y,m] = month.split('-').map(Number);
            start = dayjs.tz(new Date(y, m-1, 1)).startOf('month');
            end   = start.endOf('month');
        }
        reservations.forEach(r => {
            if(r.days && r.days.find(d => {
                const day = dayjs.tz(d.date, DEFAULT_TZ);
                return day.isSameOrAfter(start) && day.isSameOrBefore(end);
            })) {
                items.push(r);
            }
        });
    }
    
    const total = items.reduce((s,x)=> s + Number(x.totalPrice||0), 0);
    res.json({ items, total, count: items.length });

  } catch (e) {
    console.error('GET /api/revenue failed', e);
    res.status(500).json({ error:'internal_error', message:String(e?.message || e) });
  }
});

// ===== OFFICE INCIDENTS API =====
app.get('/api/office-incidents', (req, res) => {
    const incidents = readJsonSafe(officeIncidentsPath, []);
    res.json(incidents.sort((a,b) => new Date(b.date) - new Date(a.date)));
});
app.post('/api/office-incidents', upload.single('document'), (req, res) => {
    const { date, description } = req.body;
    if (!date || !description) return res.status(400).json({ error: 'Tarix və təsvir xanaları məcburidir' });
    const list = readJsonSafe(officeIncidentsPath, []);
    const newIncident = {
        id: nanoid(12),
        date,
        description,
        filePath: req.file ? `/public/uploads/${req.file.filename}` : null,
        createdAt: new Date().toISOString()
    };
    list.push(newIncident);
    writeJsonSafe(officeIncidentsPath, list);

    (async () => {
        const msg = `🔔 <b>Ofis Hadisəsi</b>
<b>Tarix:</b> ${tgEscape(dayjs(newIncident.date).format('DD.MM.YYYY'))}
<b>Təsvir:</b> ${tgEscape(newIncident.description)}`;
        await sendTelegram(msg);
    })();
    
    res.status(201).json(newIncident);
});
app.get('/api/incidents/document/:id', (req, res) => {
    const incidents = readJsonSafe(officeIncidentsPath);
    const incident = incidents.find(i => i.id === req.params.id);
    if (incident && incident.filePath) {
        res.redirect(incident.filePath);
    } else {
        res.status(404).send('Sənəd tapılmadı.');
    }
});
app.delete('/api/office-incidents/:id', (req, res) => {
    let list = readJsonSafe(officeIncidentsPath, []);
    const initialLength = list.length;
    list = list.filter(e => e.id !== req.params.id);
    if (list.length === initialLength) return res.status(404).json({ error: 'not_found' });
    writeJsonSafe(officeIncidentsPath, list);
    res.json({ message: 'Deleted' });
});

// ===== FINES (CƏRİMƏLƏR) API - YENİ DÜZƏLİŞ EDİLMİŞ VERSİYA (Massiv ilə işləyən) =====

app.get('/api/fines', (req, res) => {
    const { month, day, customerId } = req.query;
    let list = readJsonSafe(finesPath, []); 
    
    let filteredList = list;
    if (customerId) {
        filteredList = filteredList.filter(f => f.customerId === customerId);
    }
    if (day) {
        filteredList = filteredList.filter(f => (f.date || '').startsWith(day));
    } else if (month) {
        filteredList = filteredList.filter(f => (f.date || '').startsWith(month));
    }
    
    const paidFinesInFilter = filteredList.filter(f => f.isPaid);
    const total = paidFinesInFilter.reduce((s, x) => s + Number(x.amountPaid || x.amount || 0), 0);
    
    res.json({ items: filteredList.sort((a,b) => new Date(b.date) - new Date(a.date)), total });
});

app.post('/api/fines', (req, res) => {
    const { carId, customerId, amount, points, date, reason, isPaid } = req.body; 
    if (!customerId || !amount || !date) return res.status(400).json({ error: 'Bütün məcburi xanalar doldurulmalıdır.' });
    
    const list = readJsonSafe(finesPath, []); 

    const newFine = {
        id: `fine_${nanoid(10)}`,
        carId: carId || null, 
        customerId,
        amount: Number(amount),
        points: Number(points || 0),
        date, 
        reason: reason || '',
        isPaid: Boolean(isPaid),
        amountPaid: Boolean(isPaid) ? Number(amount) : 0,
        createdAt: new Date().toISOString()
    };
    
    list.push(newFine);
    writeJsonSafe(finesPath, list);

    (async () => {
        const car = readJsonSafe(carsPath).find(c => c.id === newFine.carId) || {};
        const customer = readJsonSafe(customersPath).find(c => c.id === newFine.customerId) || {};
        const msg = `🚨 <b>Yeni Cərimə</b>
<b>Müştəri:</b> ${tgEscape(customer.firstName)} ${tgEscape(customer.lastName)}
<b>Maşın:</b> ${tgEscape(car.brand)} ${tgEscape(car.model)} (${tgEscape(car.plate)})
<b>Məbləğ:</b> ${newFine.amount} AZN
<b>Səbəb:</b> ${tgEscape(newFine.reason)}`;
        await sendTelegram(msg);
    })();
    
    res.status(201).json(newFine);
});

app.patch('/api/fines/:id', (req, res) => {
    const { amountPaid, isPaid } = req.body;
    
    let list = readJsonSafe(finesPath, []); 

    const index = list.findIndex(f => f.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'not_found' });
    
    const fine = list[index];
    
    if (amountPaid !== undefined) {
        fine.amountPaid = Number(amountPaid);
    }
    
    if (isPaid !== undefined) { 
        fine.isPaid = Boolean(isPaid);
        if (fine.isPaid && fine.amountPaid < fine.amount) {
             fine.amountPaid = fine.amount;
        }
    } else {
        // Avtomatik təyin etmə
        if (fine.amountPaid >= fine.amount) {
            fine.isPaid = true;
        } else {
            fine.isPaid = false;
        }
    }
    
    list[index] = fine; 
    writeJsonSafe(finesPath, list);
    res.json(fine);
});

app.delete('/api/fines/:id', (req, res) => {
    let list = readJsonSafe(finesPath, []); 
    
    const initialLength = list.length;
    list = list.filter(f => f.id !== req.params.id); 

    if (list.length < initialLength) {
         writeJsonSafe(finesPath, list);
         res.json({ message: 'Deleted' });
    } else {
        res.status(404).json({ message: "Fine not found" });
    }
});
// ===== FINES API SONU =====


// ===== INCOMES (MƏDAXİL) API =====
app.get('/api/incomes', (req, res) => {
    const { month, day } = req.query;
    let list = readJsonSafe(incomesPath, []);
    if (day) {
        list = list.filter(i => (i.date || '').startsWith(day));
    } else if (month) {
        list = list.filter(i => (i.date || '').startsWith(month));
    }
    const total = list.reduce((s, x) => s + Number(x.amount || 0), 0);
    res.json({ items: list, total });
});
app.post('/api/incomes', (req, res) => {
    const list = readJsonSafe(incomesPath, []);
    const newItem = { id: `income_${nanoid(10)}`, ...req.body, amount: Number(req.body.amount || 0), createdAt: new Date().toISOString() };
    list.push(newItem);
    writeJsonSafe(incomesPath, list);

    (async () => {
        const msg = `💰 <b>Yeni Mədaxil</b>
<b>Mənbə:</b> ${tgEscape(newItem.source)}
<b>Təsvir:</b> ${tgEscape(newItem.description)}
<b>Məbləğ:</b> ${newItem.amount} AZN`;
        await sendTelegram(msg);
    })();

    res.status(201).json(newItem);
});
app.delete('/api/incomes/:id', (req, res) => {
    let list = readJsonSafe(incomesPath, []);
    const initialLength = list.length;
    list = list.filter(i => i.id !== req.params.id);

    if (list.length < initialLength) {
        writeJsonSafe(incomesPath, list);
        res.json({ message: 'Deleted' });
    } else {
        res.status(404).json({ message: "Income not found" });
    }
});

// ===== DASHBOARD API =====
app.get('/api/dashboard-stats', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath);
        const cars = readJsonSafe(carsPath);
        const customers = readJsonSafe(customersPath);

        const today = dayjs().tz(DEFAULT_TZ);
        const startOfToday = today.startOf('day').valueOf();
        const endOfToday = today.endOf('day').valueOf();

        const activeToday = reservations.filter(r => {
            if (!r.days || r.days.length === 0) return false;
            const start = toMs(r.days[0].date);
            const end = toMs(r.days[r.days.length - 1].date);
            return start <= endOfToday && end >= startOfToday && (r.status === 'BOOKED');
        });

        const dueToday = reservations.filter(r => {
            if (!r.days || r.days.length === 0) return false;
            const lastDay = r.days[r.days.length - 1].date;
            return dayjs(lastDay).tz(DEFAULT_TZ).isSame(today, 'day');
        }).map(r => ({
            ...r,
            customer: customers.find(c => c.id === r.customerId) || {},
            car: cars.find(c => c.id === r.carId) || {}
        }));

        const startingToday = reservations.filter(r => {
            if (!r.days || r.days.length === 0) return false;
            const firstDay = r.days[0].date;
            return dayjs(firstDay).tz(DEFAULT_TZ).isSame(today, 'day');
        });
        
        let todaysRevenue = 0;
        startingToday.forEach(r => {
            const todayData = r.days.find(d => dayjs(d.date).tz(DEFAULT_TZ).isSame(today, 'day'));
            if(todayData) todaysRevenue += (todayData.price || 0);
        });


        const stats = {
            carsInUse: activeToday.length,
            carsDueForReturn: dueToday.length,
            freeCars: cars.filter(c => c.status === 'FREE').length,
            todaysRevenue: todaysRevenue,
            dueTodayList: dueToday,
            startingTodayList: startingToday.map(r => ({
                ...r,
                customer: customers.find(c => c.id === r.customerId) || {},
                car: cars.find(c => c.id === r.carId) || {}
            }))
        };

        res.json(stats);
    } catch (error) {
        console.error("Dashboard statistikası hesablanarkən xəta:", error);
        res.status(500).json({ error: "Serverdə daxili xəta baş verdi" });
    }
});

// ===== CALENDAR API =====
app.get('/api/calendar-reservations', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath);
        const cars = readJsonSafe(carsPath);
        const customers = readJsonSafe(customersPath);

        const events = reservations.map(r => {
            if (!r.days || r.days.length === 0) return null;
            
            const car = cars.find(c => c.id === r.carId) || {};
            const customer = customers.find(c => c.id === r.customerId) || {};
            
            let color = '#1e6fff'; // Göy (Brondadır)
            if (r.status === 'COMPLETED') {
                color = '#4a5b78'; // Boz (Bitdi)
            } else if (r.status === 'CANCELED') {
                color = '#ef4444'; // Qırmızı (Ləğv edildi)
            }

            const firstDay = r.days[0].date;
            const lastDay = r.days[r.days.length - 1].date;

            return {
                id: r.id,
                title: `${car.brand} ${car.model} (${car.plate}) - ${customer.firstName}`,
                start: firstDay,
                end: dayjs(lastDay).add(1, 'day').format('YYYY-MM-DD'), // FullCalendar bitişi xaric edir
                color: color,
                extendedProps: {
                    notes: r.notes || '',
                    totalPrice: r.totalPrice,
                    isPaid: r.isPaid
                }
            };
        }).filter(Boolean); // null olanları təmizlə
        
        res.json(events);
    } catch (error) {
        console.error("Təqvim məlumatları hazırlanarkən xəta:", error);
        res.status(500).json({ error: "Serverdə daxili xəta baş verdi" });
    }
});

// ===== REPORTS API =====
app.get('/api/reports/car-popularity', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath);
        const cars = readJsonSafe(carsPath);
        const carCounts = reservations.reduce((acc, reservation) => {
            acc[reservation.carId] = (acc[reservation.carId] || 0) + 1;
            return acc;
        }, {});
        const labels = [];
        const data = [];
        for (const carId in carCounts) {
            const car = cars.find(c => c.id === carId);
            if (car) {
                labels.push(`${car.brand} ${car.model} (${car.plate})`);
                data.push(carCounts[carId]);
            }
        }
        res.json({ labels, data });
    } catch (error) { res.status(500).json({ error: "Serverdə xəta" }); }
});
app.get('/api/reports/car-profitability', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath);
        const carExpensesData = readJsonSafe(carExpensesPath);
        const carExpenses = carExpensesData.items || carExpensesData; // Hər iki strukturu dəstəklə
        const cars = readJsonSafe(carsPath);
        
        const report = cars.map(car => {
            let totalRevenue = 0;
            const carReservations = reservations.filter(r => r.carId === car.id && r.status === 'COMPLETED');
            carReservations.forEach(r => {
                if (r.days) totalRevenue += r.days.reduce((sum, d) => sum + (d.price || 0), 0);
            });
            
            const expenses = carExpenses.filter(e => e.carId === car.id);
            const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            return {
                carName: `${car.brand} ${car.model} (${car.plate})`,
                totalRevenue: totalRevenue,
                totalExpense: totalExpense,
                profit: totalRevenue - totalExpense
            };
        });
        res.json(report.sort((a, b) => b.profit - a.profit));
    } catch (error) {
        console.error("Maşın mənfəəti hesabatı hazırlanarkən xəta:", error);
        res.status(500).json({ error: "Serverdə daxili xəta baş verdi" });
    }
});
app.get('/api/reports/best-customers', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath);
        const customers = readJsonSafe(customersPath);
        const customerStats = customers.map(customer => {
            let totalRevenue = 0;
            // ==================================
            // DÜZƏLİŞ 3: Sintaksis xətası təmizləndi
            const customerReservations = reservations.filter(r => r.customerId === customer.id && r.status === 'COMPLETED');
            // ==================================
            customerReservations.forEach(r => {
                if(r.days) totalRevenue += r.days.reduce((sum, d) => sum + (d.price || 0), 0);
            });
            const rentalCount = customerReservations.length;
            return {
                customerName: `${customer.firstName} ${customer.lastName}`,
                totalRevenue: totalRevenue,
                rentalCount: rentalCount
            };
        });
        res.json(customerStats.filter(c => c.rentalCount > 0).sort((a, b) => b.totalRevenue - a.totalRevenue));
    } catch (error) {
        console.error("Ən yaxşı müştərilər hesabatı hazırlanarkən xəta:", error);
        res.status(500).json({ error: "Serverdə daxili xəta baş verdi" });
    }
});
app.get('/api/reports/occupancy', (req, res) => {
    try {
        const month = req.query.month || dayjs().format('YYYY-MM');
        const reservations = readJsonSafe(reservationsPath);
        const cars = readJsonSafe(carsPath);
        
        const startOfMonth = dayjs(month).startOf('month');
        const endOfMonth = dayjs(month).endOf('month');
        const daysInMonth = endOfMonth.diff(startOfMonth, 'day') + 1;

        const report = cars.map(car => {
            let rentedDays = 0;
            const carReservations = reservations.filter(r => r.carId === car.id && r.status !== 'CANCELED');
            
            carReservations.forEach(r => {
                if (r.days && Array.isArray(r.days)) {
                    r.days.forEach(day => {
                        const currentDay = dayjs.tz(day.date, DEFAULT_TZ);
                        if (currentDay.isAfter(startOfMonth.subtract(1, 'day')) && currentDay.isBefore(endOfMonth.add(1, 'day'))) {
                            rentedDays++;
                        }
                    });
                }
            });
            const occupancy = (rentedDays / daysInMonth) * 100;
            return {
                carName: `${car.brand} ${car.model} (${car.plate})`,
                rentedDays,
                occupancyPercentage: occupancy.toFixed(1)
            };
        });
        res.json({ report, daysInMonth });
    } catch (error) { res.status(500).json({ error: "Serverdə xəta" }); }
});
app.get('/api/reports/average-duration', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath).filter(r => r.status === 'COMPLETED');
        if (reservations.length === 0) {
            return res.json({ averageDuration: 0 });
        }
        const totalDays = reservations.reduce((sum, r) => sum + (r.days ? r.days.length : 0), 0);
        const averageDuration = totalDays / reservations.length;
        res.json({ averageDuration: averageDuration.toFixed(1) });
    } catch (error) { res.status(500).json({ error: "Serverdə xəta" }); }
});
app.get('/api/reports/revenue-by-brand', (req, res) => {
    try {
        const reservations = readJsonSafe(reservationsPath).filter(r => r.status === 'COMPLETED');
        const cars = readJsonSafe(carsPath);

        const revenueByBrand = reservations.reduce((acc, r) => {
            const car = cars.find(c => c.id === r.carId);
            if (car && car.brand) {
                acc[car.brand] = (acc[car.brand] || 0) + (r.totalPrice || 0);
            }
            return acc;
        }, {});

        const report = Object.keys(revenueByBrand)
            .map(brand => ({ brand, totalRevenue: revenueByBrand[brand] }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);
            
        res.json(report);
    } catch (error) { res.status(500).json({ error: "Serverdə xəta" }); }
});


// ----- Final setup -----
app.use('/api', (req,res)=> res.status(404).json({ error:'Not found' }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.listen(PORT, ()=> {
  console.log(`Server on http://localhost:${PORT}`);
});

// GÜNLÜK HESABATI İŞƏ SALIRIQ
cron.schedule('0 0 * * *', async () => {
    await sendDailySummary();
}, {
    scheduled: true,
    timezone: "Asia/Baku"
});

console.log("Gündəlik avtomatik hesabat sistemi (node-cron) quruldu. Hər gecə 00:00-da işləyəcək.");