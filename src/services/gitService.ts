import axios from 'axios';
import JSZip from 'jszip';

interface DownloadProgress {
    loaded: number;
    total: number;
}

export class GitService {
    // CORS代理URL
    private readonly CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
    // GitHub API基础URL
    private readonly GITHUB_API = 'https://api.github.com';

    private getRepoInfo(url: string) {
        url = url.replace(/\.git$/, '');
        const urlParts = url.split('/');
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];
        const platform = url.includes('github.com') ? 'github' :
            url.includes('gitlab.com') ? 'gitlab' :
                url.includes('gitee.com') ? 'gitee' : '';

        return { owner, repo, platform };
    }

    async downloadRepository(
        url: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<{ files: { [key: string]: string }, branch: string }> {
        const { owner, repo, platform } = this.getRepoInfo(url);

        try {
            switch (platform) {
                case 'github': {
                    // 1. 获取仓库信息和默认分支
                    const repoResponse = await axios.get(
                        `${this.GITHUB_API}/repos/${owner}/${repo}`,
                        {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        }
                    );
                    const defaultBranch = repoResponse.data.default_branch;

                    // 2. 使用GitHub API获取仓库内容
                    const treeResponse = await axios.get(
                        `${this.GITHUB_API}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
                        {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        }
                    );

                    // 3. 过滤并获取文件内容
                    const files: { [key: string]: string } = {};
                    const textExtensions = ['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'md'];

                    for (const item of treeResponse.data.tree) {
                        if (item.type === 'blob') {
                            const extension = item.path.split('.').pop()?.toLowerCase() || '';
                            if (textExtensions.includes(extension)) {
                                const contentResponse = await axios.get(
                                    `${this.GITHUB_API}/repos/${owner}/${repo}/contents/${item.path}`,
                                    {
                                        headers: {
                                            'Accept': 'application/vnd.github.v3+json'
                                        }
                                    }
                                );

                                // GitHub API返回的内容是Base64编码的
                                const content = atob(contentResponse.data.content);
                                files[item.path] = content;

                                // 更新进度
                                if (onProgress) {
                                    const progress = {
                                        loaded: Object.keys(files).length,
                                        total: treeResponse.data.tree.filter(
                                            (t: any) => t.type === 'blob' &&
                                                textExtensions.includes(t.path.split('.').pop()?.toLowerCase() || '')
                                        ).length
                                    };
                                    onProgress(progress);
                                }
                            }
                        }
                    }

                    return { files, branch: defaultBranch };
                }

                case 'gitlab': {
                    // 使用CORS代理
                    const zipUrl = `${this.CORS_PROXY}https://gitlab.com/${owner}/${repo}/-/archive/main/${repo}-main.zip`;
                    return this.downloadAndExtractZip(zipUrl, onProgress);
                }

                case 'gitee': {
                    // 使用CORS代理
                    const zipUrl = `${this.CORS_PROXY}https://gitee.com/${owner}/${repo}/repository/archive/master.zip`;
                    return this.downloadAndExtractZip(zipUrl, onProgress);
                }

                default:
                    throw new Error('Unsupported git platform');
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 403) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                } else if (error.response?.status === 404) {
                    throw new Error('Repository not found or private.');
                }
            }
            throw error;
        }
    }

    private async downloadAndExtractZip(
        zipUrl: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<{ files: { [key: string]: string }, branch: string }> {
        const response = await axios({
            method: 'get',
            url: zipUrl,
            responseType: 'arraybuffer',
            onDownloadProgress: onProgress
        });

        const zip = await JSZip.loadAsync(response.data);
        const files: { [key: string]: string } = {};
        const textExtensions = [
            // 原数组
            'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'md',
            // 编程语言
            'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'swift', 'rs', 'kt',
            'dart', 'lua', 'pl', 'r', 'clj', 'coffee', 'fs', 'h', 'hs', 'm', 'mm',
            'nim', 'v', 'groovy', 'scala', 'vb',
            // 配置与数据
            'yml', 'yaml', 'xml', 'ini', 'toml', 'env', 'properties', 'cfg', 'tf',
            'csv', 'tsv', 'sql', 'rss', 'json5', 'jsonc', 'proto',
            // 标记与文档
            'htm', 'xhtml', 'svg', 'rst', 'tex', 'markdown', 'adoc', 'asciidoc', 'txt',
            'log', 'rtf', 'odt', 'org', 'bib',
            // 样式表
            'scss', 'sass', 'less', 'stylus',
            // 脚本与模板
            'sh', 'bat', 'ps1', 'tcl', 'ejs', 'hbs', 'pug', 'j2', 'slim', 'twig', 'erb',
            'mustache', 'njk',
            // Web与开发
            'vue', 'svelte', 'graphql', 'gql', 'lock', 'conf', 'gitattributes',
            // 其他
            'diff', 'patch', 'nix', 'zsh', 'fish'
        ];

        for (const [path, file] of Object.entries(zip.files)) {
            if (!file.dir) {
                const extension = path.split('.').pop()?.toLowerCase() || '';
                if (textExtensions.includes(extension)) {
                    const content = await file.async('text');
                    files[path] = content;
                }
            }
        }

        return { files, branch: 'main' };
    }
}
