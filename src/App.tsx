// App.tsx
import { useState } from 'react';
import './App.css';

interface UploadResult {
  content: string;
  fileName: string;
}

function App() {
  const [selectedTab, setSelectedTab] = useState<'git' | 'local'>('git');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [repoUrl, setRepoUrl] = useState('');

  const handleGitImport = async () => {
    if (!repoUrl) return;
    setIsUploading(true);
    try {
      await simulateUpload();
      setResult({
        content: `从${selectedProvider}仓库(${repoUrl})解析出的示例文本内容`,
        fileName: `${selectedProvider}_content.txt`
      });
      setShowUrlInput(false);
      setRepoUrl('');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const interval = setInterval(() => {
        setUploadProgress(p => (p >= 95 ? 95 : p + 5));
      }, 100);

      const content = await parseZipFile(file);

      clearInterval(interval);
      setUploadProgress(100);
      setResult({
        content,
        fileName: file.name.replace(/\.[^/.]+$/, "") + "_extracted.txt"
      });
    } catch (err) {
      alert("文件处理失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const blob = new Blob([result.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setShowUrlInput(false);
    setSelectedProvider('');
    setRepoUrl('');
    setResult(null);
  };



  return (
    <div className="app-container">
      <div className="background-layer" />

      <main className="content-container">
        <h1 className="title">代码分析工具</h1>

        <div className="tab-switcher">
          <button
            className={`tab-btn ${selectedTab === 'git' ? 'active' : ''}`}
            onClick={() => setSelectedTab('git')}
          >
            从Git导入
          </button>
          <button
            className={`tab-btn ${selectedTab === 'local' ? 'active' : ''}`}
            onClick={() => setSelectedTab('local')}
          >
            本地上传
          </button>
        </div>

        {!result ? (
          <div className="content-area">
            {selectedTab === 'git' && (
              <>
                {!showUrlInput ? (
                  <div className="git-providers">
                    {['GitHub', 'GitLab', 'Gitee'].map((provider) => (
                      <button
                        key={provider}
                        onClick={() => {
                          setSelectedProvider(provider);
                          setShowUrlInput(true);
                        }}
                        disabled={isUploading}
                      >
                        <img
                          src={`/${provider.toLowerCase()}-icon.svg`}
                          alt={provider}
                        />
                        {provider}
                      </button>
                    ))}
                  </div>
                ) : (
                    <div className="url-input-section">
                      <button className="back-btn" onClick={() => setShowUrlInput(false)}>
                        选择仓库
                      </button>
                    <div className="url-input-container">
                      <input
                        type="text"
                        className="url-input"
                        placeholder={`请输入${selectedProvider}仓库URL`}
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        disabled={isUploading}
                      />
                      <button
                        className="confirm-button"
                        onClick={handleGitImport}
                        disabled={isUploading || !repoUrl}
                      >
                        确认
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {selectedTab === 'local' && (
              <div className="upload-section">
                <label className="file-upload">
                  <input
                    type="file"
                    accept=".zip,.tar.gz,.7z"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    disabled={isUploading}
                  />
                  <span>选择压缩包</span>
                </label>
              </div>
            )}

            {isUploading && (
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                <div className="spinner" />
                <span className="progress-text">{uploadProgress}%</span>
              </div>
            )}
          </div>
        ) : (
          <div className="result-section">
            <pre>{result.content}</pre>
              <div className="button-group">
                <button onClick={handleReset} className="result-btn return">
                  返回主页
                </button>
                <button onClick={handleDownload} className="result-btn download">
                  下载结果
                </button>
              </div>

          </div>
        )}
      </main>
    </div>
  );
}

async function parseZipFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`示例解析内容来自：${file.name}\n${'Lorem ipsum '.repeat(50)}`);
    }, 1500);
  });
}

async function simulateUpload(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 2000);
  });
}

export default App;
