'use client';

import { ArrowDown, ArrowRight, BedDouble, CalendarDays, CheckCircle2, MapPin, Maximize, Users, Waves, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Booking, dateLabel, errorText, hotelDate, money, Room, Session, statusLabels } from './api-client';

type Stay = {check_in: string; check_out: string; guests: number};
const stayDays = (stay: Stay) => (Date.parse(stay.check_out) - Date.parse(stay.check_in)) / 86400000;

function Confirmation({booking}: {booking: Booking}) {
  return <div className="confirmation">
    <CheckCircle2 size={32}/><p className="eyebrow">Mã đặt phòng</p><h2>{booking.code}</h2>
    <p><strong>{booking.room_name}</strong><br/>{dateLabel(booking.check_in)} – {dateLabel(booking.check_out)} · {booking.guests} khách</p>
    <p>{statusLabels[booking.status]} · {booking.paid_at ? 'Đã thanh toán' : 'Thanh toán tại khách sạn'}</p>
    <strong>{money(booking.total)}</strong>
  </div>;
}

export default function Home() {
  const [stay, setStay] = useState<Stay>({check_in: '', check_out: '', guests: 2});
  const [searched, setSearched] = useState<Stay | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [mode, setMode] = useState<'booking' | 'lookup' | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [searchError, setSearchError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [searching, setSearching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestKey, setRequestKey] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const results = useRef<HTMLElement>(null);

  useEffect(() => {
    setStay({check_in: hotelDate(), check_out: hotelDate(1), guests: 2});
    api<Room[]>('/rooms')
      .then(setRooms)
      .catch(error => setSearchError(errorText(error)))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError('');
    setSearched(null);
    results.current?.scrollIntoView({block: 'start'});
    try {
      setRooms(await api<Room[]>('/rooms?' + new URLSearchParams({...stay, guests: String(stay.guests)})));
      setSearched(stay);
    } catch (error) {
      setRooms([]);
      setSearchError(errorText(error));
    } finally { setSearching(false); }
  }

  function open(nextMode: 'booking' | 'lookup', selected?: Room) {
    setRoom(selected ?? null);
    setBooking(null);
    setDialogError('');
    setRequestKey(crypto.randomUUID());
    setMode(nextMode);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setSubmitting(true);
    setDialogError('');
    try {
      const {csrf} = await api<Session>('/session');
      const response = mode === 'lookup'
        ? await api<Booking>('/bookings/lookup', 'POST', values, csrf)
        : await api<Booking>('/bookings', 'POST', {...values, ...searched, room_id: room?.id, quoted_rate: room?.price, request_key: requestKey}, csrf);
      setBooking(response);
    } catch (error) {
      setDialogError(errorText(error));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <header className="site-header">
      <a className="brand" href="/" aria-label="GLG Hotel, trang chủ"><span className="brand-icon"><Waves size={23}/></span><span>GLG HOTEL<small>ĐÀ NẴNG</small></span></a>
      <nav aria-label="Điều hướng chính"><a href="#rooms">Phòng nghỉ</a><a href="#hotel">Khách sạn</a><button className="link" onClick={() => open('lookup')}>Tra cứu đặt phòng</button></nav>
      <a className="button primary header-cta" href="#booking">Đặt phòng <ArrowRight size={16}/></a>
    </header>

    <main>
      <section className="hero" id="hotel">
        <div className="hero-image"/>
        <div className="hero-inner">
          <p className="eyebrow"><MapPin size={15}/> ĐÀ NẴNG, VIỆT NAM</p>
          <h1>Một kỳ nghỉ<br/>bên <em>sông Hàn.</em></h1>
          <p className="hero-copy">Phòng nghỉ nhìn ra thành phố và dòng sông, ngay giữa trung tâm Đà Nẵng.</p>
          <a className="hero-link" href="#rooms">Khám phá phòng nghỉ <ArrowDown size={16}/></a>
        </div>
      </section>

      <div className="container booking-wrap" id="booking">
        <form className="booking-bar" onSubmit={search}>
          <label><span><CalendarDays size={17}/> Nhận phòng</span><input required aria-label="Nhận phòng" type="date" min={hotelDate()} value={stay.check_in} onChange={event => setStay({...stay, check_in: event.target.value})}/></label>
          <label><span><CalendarDays size={17}/> Trả phòng</span><input required aria-label="Trả phòng" type="date" min={stay.check_in || hotelDate()} value={stay.check_out} onChange={event => setStay({...stay, check_out: event.target.value})}/></label>
          <label><span><Users size={17}/> Số khách</span><select value={stay.guests} onChange={event => setStay({...stay, guests: Number(event.target.value)})}>{Array.from({length: 12}, (_, index) => <option key={index} value={index+1}>{index+1} khách</option>)}</select></label>
          <button className="button primary" disabled={searching}>{searching ? 'Đang tải…' : 'Tìm phòng trống'} <ArrowRight size={18}/></button>
        </form>
      </div>

      <section className="container rooms-section" id="rooms" ref={results}>
        <div className="section-title">
          <div><p className="eyebrow">PHÒNG & SUITE</p><h2>Phòng nghỉ bên sông</h2></div>
          <p>{searched ? `${dateLabel(searched.check_in)} – ${dateLabel(searched.check_out)} · ${searched.guests} khách` : 'Chọn ngày lưu trú để xem phòng còn trống và giá cho kỳ nghỉ của bạn.'}</p>
        </div>
        {searchError && <p className="notice error" role="alert">{searchError}</p>}
        {searching ? <p className="notice" role="status">Đang tải phòng…</p> : !rooms.length && !searchError && <p className="notice">Không còn phòng phù hợp. Hãy thử ngày khác hoặc thay đổi số khách.</p>}
        {!searching && <div className="room-grid">
          {rooms.map((item) => <article className="room-card" key={item.id}>
            <div className="room-photo"><img src={item.image || '/images/deluxe.webp'} alt={item.name} loading="lazy"/></div>
            <div className="room-body">
              <h3>{item.name}</h3><p>{item.description}</p>
              <div className="amenities"><span><Maximize size={15}/>{item.area} m²</span><span><Users size={15}/>{item.capacity} khách</span><span><BedDouble size={15}/>{item.bed}</span></div>
              <div className="room-foot"><span><strong>{money(item.price)}</strong><small> / đêm</small></span>
                {searched ? <button className="button outline" onClick={() => open('booking', item)}>Chọn phòng <ArrowRight size={15}/></button> : <a className="button outline" href="#booking">Chọn ngày <ArrowRight size={15}/></a>}
              </div>
            </div>
          </article>)}
        </div>}
      </section>
    </main>

    <footer className="site-footer"><div className="container"><span><strong>GLG HOTEL</strong><small>Đà Nẵng, Việt Nam</small></span><div><button className="link" onClick={() => open('lookup')}>Tra cứu đặt phòng</button><a href="/admin">Quản trị</a></div></div></footer>

    <dialog ref={dialog} onClose={() => setMode(null)} onCancel={event => { if (submitting) event.preventDefault(); }} className="hotel-dialog">
      <button className="icon close" aria-label="Đóng" disabled={submitting} onClick={() => setMode(null)}><X size={21}/></button>
      {booking ? <Confirmation booking={booking}/> : <form className="stack" onSubmit={submit} onChange={() => mode === 'booking' && setRequestKey(crypto.randomUUID())}>
        <p className="eyebrow">{mode === 'lookup' ? 'KỲ NGHỈ CỦA BẠN' : 'ĐẶT PHÒNG'}</p>
        <h2>{mode === 'lookup' ? 'Tra cứu đặt phòng' : room?.name}</h2>
        {mode === 'booking' && searched && room && <p className="notice">{dateLabel(searched.check_in)} – {dateLabel(searched.check_out)} · {stayDays(searched)} đêm · <strong>{money(stayDays(searched) * room.price)}</strong><br/>Thanh toán tại khách sạn.</p>}
        {mode === 'lookup' ? <label>Mã đặt phòng<input name="code" required maxLength={32} placeholder="GLG-…"/></label> : <label>Họ và tên<input name="guest_name" autoComplete="name" required maxLength={120}/></label>}
        <label>Email<input name="email" autoComplete="email" type="email" required maxLength={200}/></label>
        {mode === 'booking' && <label>Số điện thoại<input name="phone" autoComplete="tel" type="tel" required maxLength={25}/></label>}
        {dialogError && <p className="notice error" role="alert">{dialogError}</p>}
        <button className="button primary" disabled={submitting}>{submitting ? 'Đang xử lý…' : mode === 'lookup' ? 'Tra cứu' : 'Gửi yêu cầu đặt phòng'} <ArrowRight size={17}/></button>
      </form>}
    </dialog>
  </>;
}
