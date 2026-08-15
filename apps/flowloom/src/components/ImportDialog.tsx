import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, FileUp, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import type { ImportResult } from '../types';
import { importDiagramFile, supportedImportSummary } from '../lib/fileAdapters';
import { IconButton } from './IconButton';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}

export function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'ready'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setResult(null);
      setError('');
      setDragging(false);
    }
  }, [open]);

  const loadFile = async (file: File) => {
    setStatus('reading');
    setError('');
    setResult(null);
    try {
      const imported = await importDiagramFile(file);
      setResult(imported);
      setStatus('ready');
    } catch (loadError) {
      setStatus('idle');
      setError(loadError instanceof Error ? loadError.message : '文件无法导入。');
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const apply = () => {
    if (!result) return;
    onImport(result);
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="app-dialog import-dialog" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-header">
        <div className="dialog-title"><span className="dialog-title__icon"><FileUp size={18} /></span><div><h2>PDF 拆 SVG / 图形导入</h2><p>矢量几何、文字与原始参考分层</p></div></div>
        <IconButton label="关闭" icon={<X size={18} />} onClick={onClose} />
      </div>
      <div className="import-dialog__body">
        <label
          className={`file-drop import-drop ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {status === 'reading' ? <LoaderCircle className="spin" size={28} /> : <FileUp size={28} />}
          <strong>{status === 'reading' ? '正在拆解图元' : '选择 PDF 或图形文件'}</strong>
          <span>PDF · SVG · draw.io · VSDX · Mermaid 等</span>
          <input
            type="file"
            accept=".json,.flow,.yaml,.yml,.drawio,.xml,.mmd,.mermaid,.dot,.gv,.bpmn,.excalidraw,.svg,.csv,.puml,.plantuml,.vsdx,image/*,.pdf"
            onChange={(event) => event.target.files?.[0] && void loadFile(event.target.files[0])}
          />
        </label>

        {error && <div className="inline-message inline-message--error" role="alert">{error}</div>}

        {result ? (
          <div className="import-result">
            <div className="import-result__headline">
              {result.fidelity === 'structural' ? <CheckCircle2 size={19} /> : <TriangleAlert size={19} />}
              <div><strong>{result.title}</strong><span>{result.sourceFormat} · {result.nodes.length} 节点 · {result.edges.length} 连线</span></div>
              <span className={`fidelity-badge fidelity-badge--${result.fidelity}`}>
                {result.fidelity === 'structural' ? '结构保真' : result.fidelity === 'hybrid' ? '混合保真' : '视觉保真'}
              </span>
            </div>
            {result.pdfExtraction && (
              <div className="import-result__metrics" aria-label="PDF extraction summary">
                <span><strong>{result.pdfExtraction.editablePrimitives}</strong> 矢量图元</span>
                <span><strong>{result.pdfExtraction.textPrimitives}</strong> 文字对象</span>
                <span><strong>{result.pdfExtraction.rasterOperations}</strong> 位图操作</span>
                <span><strong>{result.pdfExtraction.pageCount}</strong> / {result.pdfExtraction.sourcePageCount} 页</span>
                {result.pdfExtraction.omittedPrimitives > 0 && <span><strong>{result.pdfExtraction.omittedPrimitives}</strong> 仅保留在参考层</span>}
              </div>
            )}
            {result.warnings.length > 0 && <ul>{result.warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}{result.warnings.length > 6 && <li>另有 {result.warnings.length - 6} 条逐页提示，可在来源信息中核对。</li>}</ul>}
          </div>
        ) : (
          <div className="format-grid" aria-label="支持格式">
            {supportedImportSummary().map((format) => <span key={format}>{format}</span>)}
          </div>
        )}
      </div>
      <div className="dialog-footer">
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button className="primary-button" onClick={apply} disabled={!result}>{result?.pdfExtraction ? '载入可编辑图元' : '导入到画布'}</button>
      </div>
    </dialog>
  );
}
