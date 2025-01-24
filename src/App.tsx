// App.tsx
import { useState } from 'react';
import './App.css';
import { GitService } from './services/gitService';
import { CodeAnalyzer } from './services/codeAnalyzer';
import { messageService } from './services/messageService';

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
  const [urlError, setUrlError] = useState('');

  const gitService = new GitService();

  const handleGitImport = async () => {
    if (!repoUrl) return;
    setIsUploading(true);
    setUploadProgress(0);
    //{ files: { [key: string]: string }, branch: string }
    try {
      const { files: rawFiles, branch } = await gitService.downloadRepository(
        repoUrl,
        (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
        }
      );
      const files = await gitService.processFiles(rawFiles, branch); // 添加处理步骤

      // 构建输出内容
      let content = '# 项目结构\n\n';
      content += files.tree + '\n\n';
      // messageService.show({
      //   type: 'info',
      //   content: files.tree
      // });

      // 添加关键文件
      content += '# 关键文件\n\n';
      Object.entries(files.keyFiles).forEach(([path, code]) => {
        content += `## ${path}\n\`\`\`\n${code}\n\`\`\`\n\n`;
      });

      // 添加配置文件
      content += '# 配置\n\n';
      Object.entries(files.configs).forEach(([path, config]) => {
        content += `## ${path}\n\`\`\`json\n${JSON.stringify(config, null, 2)
          }\n\`\`\`\n\n`;
      });

      // 添加抽象文件结构
      content += '# 其余文件结构\n\n';
      Object.entries(files.abstractFiles).forEach(([path, structure]) => {
        content += `## ${path}\n\`\`\`\n${structure}\n\`\`\`\n\n`;
      });

      // 添加代码分析报告
      const analyzer = new CodeAnalyzer();
      const analysisFiles = {
        ...files.keyFiles,
        ...Object.entries(files.abstractFiles)
          .filter(([path]) => SUPPORTED_EXTENSIONS.test(path))
          .reduce((acc, [path, content]) => ({ ...acc, [path]: content }), {})
      };
      const analysis = analyzer.analyzeProject(analysisFiles);
      const report = analyzer.generateReport(analysis);
      content += `# 代码分析报告\n\n${report}`;

      setResult({
        content,
        fileName: `${repoUrl.split('/').pop()}_${branch}.txt`
      });
      setShowUrlInput(false);
      setRepoUrl('');
    } catch (error) {
      messageService.show({
        type: 'error',
        content: error instanceof Error ? error.message : '下载仓库失败'
      });
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
      messageService.show({
        type: 'error',
        content: error instanceof Error ? error.message : '处理文件失败'
      });
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

  // 验证git仓库URL的函数
  // 验证git仓库URL的函数
  const validateGitUrl = (url: string): { isValid: boolean; message: string } => {
    if (!url.trim()) {
      return { isValid: false, message: '请输入仓库地址' };
    }

    try {
      new URL(url);
    } catch {
      return { isValid: false, message: '请输入有效的URL地址' };
    }

    const gitPatterns = [
      /^https?:\/\/github\.com\/[\w-]+\/[\w-]+(?:\.git)?$/,
      /^https?:\/\/gitlab\.com\/[\w-]+\/[\w-]+(?:\.git)?$/,
      /^https?:\/\/gitee\.com\/[\w-]+\/[\w-]+(?:\.git)?$/
    ];

    if (!gitPatterns.some(pattern => pattern.test(url))) {
      return {
        isValid: false,
        message: '请输入有效的Git仓库地址 (支持GitHub、GitLab、Gitee)'
      };
    }

    return { isValid: true, message: '' };
  };


  // 修改URL处理函数
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setRepoUrl(newUrl);
    const { isValid, message } = validateGitUrl(newUrl);
    setUrlError(message);
  };

  // 添加提交处理函数
  const handleSubmit = () => {
    if (!repoUrl || urlError) return;
    handleGitImport();
  };



  return (
    <div className="app-container">
      <div className="background-layer" />
      <main className="content-container">
        <h1 className="title">项目代码 All in One</h1>

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
                        className={`url-input ${urlError ? 'error' : ''}`}
                        value={repoUrl}
                        onChange={handleUrlChange}
                        placeholder="请输入Git仓库地址"
                      />
                      {urlError && <div className="url-error-message">{urlError}</div>}
                      <button
                        className="confirm-button"
                        disabled={!repoUrl || !!urlError}
                        onClick={handleSubmit}
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
