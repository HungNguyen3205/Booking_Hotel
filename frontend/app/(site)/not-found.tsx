import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="wrap-narrow" style={{ paddingBlock: 80 }}>
      <div className="state"><strong>Không tìm thấy trang</strong><span className="small">Trang bạn tìm có thể đã được di chuyển hoặc chưa được công bố.</span>
        <div className="row"><Link className="btn" href="/">Trang chủ</Link><Link className="btn btn-primary" href="/phong">Xem loại phòng</Link></div></div>
    </section>
  );
}
