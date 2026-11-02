export const dynamic = 'force-dynamic';

/** Configurações expostas sem segredos: o que está configurado e o que falta. */
export default function SettingsPage() {
  const items: Array<[string, string, boolean]> = [
    ['Modelo do agente', process.env.AGENT_MODEL || 'claude-opus-5-5 (padrão)', true],
    ['Serviço de agente', process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:4100 (padrão)', Boolean(process.env.AGENT_SERVICE_TOKEN)],
    ['Credenciais sociais cifradas', process.env.CREDENTIALS_ENCRYPTION_KEY ? 'chave configurada' : 'CREDENTIALS_ENCRYPTION_KEY ausente', Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY)],
    ['Transcrição', process.env.TRANSCRIPTION_PROVIDER || 'whisper.cpp (padrão)', Boolean(process.env.WHISPER_MODEL || process.env.TRANSCRIPTION_PROVIDER === 'faster-whisper')],
    ['Limite de upload', `${Math.round(Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 ** 3) / 1024 ** 3)} GB`, true],
    ['Storage', process.env.STORAGE_DRIVER || 'local', true],
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Configurações</h1>
      <table className="card">
        <tbody>
          {items.map(([k, v, ok]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td><span className="chip" data-tone={ok ? 'ok' : 'warn'}>{ok ? 'ok' : 'pendente'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card">
        <h2>Atalhos do estúdio</h2>
        <ul>
          <li><kbd>Espaço</kbd> tocar/pausar · <kbd>←</kbd>/<kbd>→</kbd> 1 frame · <kbd>Shift</kbd>+setas 1 s</li>
          <li><kbd>S</kbd> dividir no cursor · <kbd>Delete</kbd> excluir seleção · <kbd>L</kbd> bloquear/desbloquear</li>
          <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> desfazer · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> refazer (cada passo cria revisão auditável)</li>
        </ul>
      </div>
    </div>
  );
}
