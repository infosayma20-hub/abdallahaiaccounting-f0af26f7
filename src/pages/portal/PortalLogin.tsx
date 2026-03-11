import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Eye, EyeOff, User, Lock, Loader2 } from 'lucide-react';

export default function PortalLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading, login } = usePortalAuth();

  useEffect(() => {
    if (!authLoading && user) navigate('/portal/dashboard', { replace: true });
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(username, password, rememberMe);
      navigate('/portal/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'خطأ في تسجيل الدخول');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="portal-login" style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0A0A0A 0%, #1A0A00 50%, #2D1200 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.015) 10px, rgba(255,255,255,0.015) 11px)',
        pointerEvents: 'none',
      }} />

      <div
        className={shake ? 'portal-shake' : ''}
        style={{
          width: 'min(420px, 92vw)',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 24,
          padding: '40px 36px',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,165,0,0.1)',
          position: 'relative', zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #D4A017, #8B5E00)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(212,160,23,0.3)',
          }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>📊</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>بوابة الإدارة</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>متابعة المبيعات والسيولة</div>
          <div style={{
            height: 1, margin: '24px auto',
            background: 'linear-gradient(90deg, transparent, #D4A017, transparent)',
          }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <User size={16} style={{ position: 'absolute', right: 16, top: 18, color: '#D4A017', zIndex: 2 }} />
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="اسم المستخدم"
              autoComplete="username"
              className="portal-input"
              style={{
                width: '100%', height: 52,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12, padding: '0 44px 0 16px',
                color: 'white', fontSize: 14,
                fontFamily: 'Tajawal, sans-serif',
                outline: 'none', direction: 'rtl',
              }}
            />
          </div>

          <div style={{ marginBottom: 16, position: 'relative' }}>
            <Lock size={16} style={{ position: 'absolute', right: 16, top: 18, color: '#D4A017', zIndex: 2 }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              autoComplete="current-password"
              className="portal-input"
              style={{
                width: '100%', height: 52,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12, padding: '0 44px',
                color: 'white', fontSize: 14,
                fontFamily: 'Tajawal, sans-serif',
                outline: 'none', direction: 'rtl',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', left: 12, top: 14,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', padding: 4, zIndex: 2,
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 16, cursor: 'pointer',
            fontSize: 12, color: 'rgba(255,255,255,0.6)',
          }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ accentColor: '#D4A017', width: 16, height: 16 }}
            />
            تذكرني لـ 30 يوم
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 52,
              background: loading ? 'rgba(212,160,23,0.5)' : 'linear-gradient(135deg, #D4A017, #8B5E00)',
              borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 700,
              fontFamily: 'Tajawal, sans-serif',
              border: 'none', cursor: loading ? 'wait' : 'pointer',
              marginTop: 8, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> جاري التحقق...</>
            ) : 'دخول ←'}
          </button>

          {error && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(248,113,113,0.1)',
              color: '#F87171', fontSize: 13, textAlign: 'center',
            }}>
              ❌ {error}
            </div>
          )}
        </form>
      </div>

      <div style={{
        position: 'fixed', bottom: 16, width: '100%', textAlign: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.2)',
      }}>
        بوابة الإدارة • مدعوم بـ FINIX
      </div>

      <style>{`
        @keyframes portalShake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .portal-shake { animation: portalShake 0.5s ease; }
        .portal-input:focus {
          border-color: #D4A017 !important;
          background: rgba(255,255,255,0.1) !important;
          box-shadow: 0 0 0 3px rgba(212,160,23,0.2) !important;
        }
        .portal-input::placeholder { color: rgba(255,255,255,0.4) !important; }
        .portal-login select option { background: #1a1a1a; color: white; }
      `}</style>
    </div>
  );
}
