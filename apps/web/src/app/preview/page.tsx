import { RabiscoPreview } from '@/components/RabiscoPreview';

export const dynamic = 'force-dynamic';

export default function PreviewPage() {
  return (
    <main>
      <h1>Preview / Teste</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Testa movimentação do personagem, props e estilos de legenda sem gerar nada no
        Gemini/TTS. <a href="/">Voltar aos projetos</a>.
      </p>

      <RabiscoPreview />
    </main>
  );
}
