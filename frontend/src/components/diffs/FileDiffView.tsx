import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { Diff } from 'shared/types';

interface FileDiffViewProps {
  diff: Diff;
}

export function FileDiffView({ diff }: FileDiffViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const filePath = diff.newPath || diff.oldPath || 'unknown';
  const changeType = diff.change;

  const getChangeColor = () => {
    switch (changeType) {
      case 'added':
        return 'text-green-600';
      case 'deleted':
        return 'text-red-600';
      case 'modified':
        return 'text-yellow-600';
      case 'renamed':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getChangeLabel = () => {
    switch (changeType) {
      case 'added':
        return '新增';
      case 'deleted':
        return '删除';
      case 'modified':
        return '修改';
      case 'renamed':
        return '重命名';
      case 'copied':
        return '复制';
      default:
        return '变更';
    }
  };

  // Simple diff rendering - split by lines
  const renderDiff = () => {
    if (diff.contentOmitted) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          文件内容过大，已省略显示
          {diff.additions !== undefined && diff.deletions !== undefined && (
            <span> (新增 {diff.additions} 行，删除 {diff.deletions} 行)</span>
          )}
        </div>
      );
    }

    if (!diff.oldContent && !diff.newContent) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          无法显示 diff（可能是二进制文件）
        </div>
      );
    }

    const oldLines = diff.oldContent?.split('\n') || [];
    const newLines = diff.newContent?.split('\n') || [];

    // Simple side-by-side diff display
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs font-mono">
          <colgroup>
            <col className="w-12" />
            <col className="w-1/2" />
            <col className="w-12" />
            <col className="w-1/2" />
          </colgroup>
          <tbody>
            {changeType === 'added' && newLines.map((line, idx) => (
              <tr key={idx} className="bg-green-50 dark:bg-green-950/10">
                <td className="px-2 py-0.5 text-right text-muted-foreground border-r"></td>
                <td className="px-2 py-0.5"></td>
                <td className="px-2 py-0.5 text-right text-muted-foreground border-r">{idx + 1}</td>
                <td className="px-2 py-0.5">
                  <span className="text-green-600">+</span> {line}
                </td>
              </tr>
            ))}
            {changeType === 'deleted' && oldLines.map((line, idx) => (
              <tr key={idx} className="bg-red-50 dark:bg-red-950/10">
                <td className="px-2 py-0.5 text-right text-muted-foreground border-r">{idx + 1}</td>
                <td className="px-2 py-0.5">
                  <span className="text-red-600">-</span> {line}
                </td>
                <td className="px-2 py-0.5 text-right text-muted-foreground border-r"></td>
                <td className="px-2 py-0.5"></td>
              </tr>
            ))}
            {changeType === 'modified' && Array.from(
              { length: Math.max(oldLines.length, newLines.length) },
              (_, idx) => {
                const oldLine = oldLines[idx];
                const newLine = newLines[idx];
                const isDifferent = oldLine !== newLine;

                return (
                  <tr
                    key={idx}
                    className={isDifferent ? 'bg-yellow-50 dark:bg-yellow-950/10' : ''}
                  >
                    <td className="px-2 py-0.5 text-right text-muted-foreground border-r">
                      {oldLine !== undefined ? idx + 1 : ''}
                    </td>
                    <td className="px-2 py-0.5">
                      {oldLine !== undefined && (
                        <>
                          {isDifferent && <span className="text-red-600">-</span>} {oldLine}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-0.5 text-right text-muted-foreground border-r">
                      {newLine !== undefined ? idx + 1 : ''}
                    </td>
                    <td className="px-2 py-0.5">
                      {newLine !== undefined && (
                        <>
                          {isDifferent && <span className="text-green-600">+</span>} {newLine}
                        </>
                      )}
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden mb-4">
      {/* File header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 bg-muted hover:bg-muted/80 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="font-mono text-sm flex-1 text-left truncate">
          {filePath}
        </span>
        <span className={`text-xs font-semibold ${getChangeColor()}`}>
          {getChangeLabel()}
        </span>
        {diff.additions !== undefined && diff.deletions !== undefined && (
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600">+{diff.additions}</span>
            {' '}
            <span className="text-red-600">-{diff.deletions}</span>
          </span>
        )}
      </button>

      {/* Diff content */}
      {isExpanded && (
        <div className="bg-background">
          {renderDiff()}
        </div>
      )}
    </div>
  );
}
