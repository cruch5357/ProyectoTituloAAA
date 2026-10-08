import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getHomePathForRole } from '../auth/roleHome';

export function HomePage() {
  const { status, user } = useAuth();
  const [year] = useState(() => new Date().getFullYear());

  if (status === 'authenticated' && user) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Navegación de producto"><a href="#caracteristicas">Características</a><a href="#como-funciona">Cómo funciona</a><Link className="button button--primary" to="/register">Crear cuenta Coach</Link></nav>
      <section className="landing-hero">
        <div><p className="eyebrow">PLANIFICACIÓN · ENTRENAMIENTO · PROGRESO</p><h1>Entrena mejor.<br /><span>Planifica con datos.</span></h1>
          <p className="landing-lead">Tu planificación tiene un propósito. Dale continuidad con cada sesión.</p>
          <p>Un espacio compartido para que coaches y atletas organicen programas, registren el esfuerzo real y tomen decisiones con su historial a la vista.</p>
          <div className="landing-actions"><Link className="button button--primary" to="/register">Comenzar como Coach ↗</Link><Link className="button button--secondary" to="/login">Iniciar sesión</Link></div>
          <p className="muted">Del primer bloque al próximo objetivo.</p>
        </div>
        <div className="product-preview" aria-label="Presentación visual ilustrativa de la plataforma">
          <p className="preview-caption">PRESENTACIÓN VISUAL · DATOS ILUSTRATIVOS</p>
          <div className="preview-window"><div className="preview-toolbar"><span>● ● ●</span><strong>Entrenamiento / Coach</strong></div>
            <div className="preview-content"><p className="eyebrow">TU EQUIPO, EN PERSPECTIVA</p><h2>Cada sesión cuenta.</h2>
              <div className="preview-stats"><div><strong>03</strong><span>Atletas</span></div><div><strong>12</strong><span>Sesiones registradas</span></div><div><strong>02</strong><span>Próximos objetivos</span></div></div>
              <div className="preview-chart" aria-hidden="true">{[28, 45, 38, 63, 52, 78, 68, 92].map((height, i) => <span key={i} style={{ height: `${height}%` }} />)}</div>
              <p className="muted">Planificación → Registro → Evolución</p>
            </div>
          </div>
          <div className="preview-phone"><span className="phone-notch" /><p className="eyebrow">TU PRÓXIMO PASO</p><h3>Entrenamiento de hoy</h3><p>Fuerza · Semana 2</p><div className="preview-exercise"><strong>Sentadilla</strong><small>3 series · 8 repeticiones</small></div><div className="preview-exercise"><strong>Remo</strong><small>3 series · 10 repeticiones</small></div><span className="preview-cta">Registrar mi sesión →</span></div>
        </div>
      </section>
      <section id="caracteristicas" className="landing-section"><p className="eyebrow">UN PROCESO CONECTADO</p><h2>Menos dispersión.<br />Más dirección.</h2>
        <div className="landing-pillars">{[
          ['01', 'Planifica', 'Construye el camino.', 'Organiza programas, bloques, semanas y sesiones. Asigna a cada atleta una fecha de inicio clara.'],
          ['02', 'Entrena', 'Haz que cuente.', 'Registra cargas, repeticiones, RPE y RIR. Consulta los videos de ejercicios y conversa con tu coach.'],
          ['03', 'Analiza', 'Aprende de lo realizado.', 'Revisa el historial y las métricas de entrenamiento para ajustar la planificación con información real.'],
        ].map(([number, title, subtitle, body]) => <article key={title}><span className="pillar-number">{number}</span><p className="eyebrow">{title}</p><h3>{subtitle}</h3><p>{body}</p></article>)}</div>
      </section>
      <section className="landing-audiences"><article><p className="eyebrow">PARA COACHES</p><h2>Una visión completa.<br />Un acompañamiento cercano.</h2><p>Planifica, asigna, supervisa y analiza. Encuentra los alumnos que requieren atención y mantén la comunicación junto a su proceso.</p><Link to="/register">Crear mi espacio de Coach →</Link></article><article><p className="eyebrow">PARA ATLETAS</p><h2>Tu siguiente sesión.<br />Tu próximo objetivo.</h2><p>Entrenamiento de hoy, registro rápido, videos, historial y competiciones. Comparte imágenes o videos con tu coach desde el chat.</p><Link to="/login">Entrar a mi entrenamiento →</Link></article></section>
      <section id="como-funciona" className="landing-section"><p className="eyebrow">CÓMO FUNCIONA</p><h2>Del plan a la práctica.</h2><ol className="product-flow">{['Planificación', 'Asignación', 'Entrenamiento', 'Datos', 'Decisiones'].map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol><p>El coach prepara el programa. El atleta registra cada sesión. Ambos revisan el proceso y deciden el siguiente paso.</p></section>
      <section className="landing-final"><p className="eyebrow">TU ENTRENAMIENTO, CON CONTINUIDAD</p><h2>Todo tu proceso de entrenamiento<br />en un mismo lugar.</h2><div className="landing-actions"><Link className="button button--primary" to="/register">Crear cuenta Coach</Link><Link to="/login">Iniciar sesión</Link></div></section>
      <footer className="landing-footer"><strong>Entrenamiento</strong><span>Proyecto académico · {year}</span></footer>
    </div>
  );
}

export default HomePage;
