import axios from 'axios';
import JSZip from 'jszip';

interface DownloadProgress {
    loaded: number;
    total: number;
}

interface ProjectStructure {
    tree: string; // 文件树字符串
    keyFiles: { [path: string]: string }; // 关键文件的完整代码
    abstractFiles: { [path: string]: string }; // 其他文件的抽象表示
    configs: { [path: string]: any }; // 配置文件的主要内容
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

    private generateFileTree(files: { [path: string]: string }): string {
        const paths = Object.keys(files).sort();
        let tree = '';
        let prevPath: string[] = [];

        paths.forEach(path => {
            const parts = path.split('/');
            const indent = parts.map((_, i) => '  '.repeat(i)).join('');
            const isLast = paths.indexOf(path) === paths.length - 1;

            // 比较当前路径和前一个路径，只显示变化的部分
            let diffIndex = 0;
            while (diffIndex < parts.length &&
                diffIndex < prevPath.length &&
                parts[diffIndex] === prevPath[diffIndex]) {
                diffIndex++;
            }

            // 添加新的目录层级
            for (let i = diffIndex; i < parts.length; i++) {
                const prefix = isLast && i === parts.length - 1 ? '└── ' : '├── ';
                tree += `${indent}${prefix}${parts[i]}\n`;
            }

            prevPath = parts;
        });

        return tree;
    }

    private isKeyFile(path: string): boolean {
        // 定义关键文件的规则
        const keyPatterns = [
            /^src\/index\.[jt]sx?$/,  // 入口文件
            /^src\/App\.[jt]sx?$/,    // 主应用组件
            /^src\/main\.[jt]sx?$/,   // 主文件
            /package\.json$/,         // package.json
            /^src\/components\/.*\/index\.[jt]sx?$/ // 组件入口文件
        ];
        return keyPatterns.some(pattern => pattern.test(path));
    }

    private generateAbstractCode(content: string): string {
        // 使用简单的AST或者结构描述来替代完整代码
        // 这里只是一个示例，你可以使用更复杂的AST解析
        const lines = content.split('\n');
        const imports = lines.filter(line => line.startsWith('import'));
        const exports = lines.filter(line => line.includes('export'));
        const functions = lines
            .filter(line => line.includes('function') || line.includes('=>'))
            .map(line => line.trim());

        return [
            '// Imports',
            ...imports,
            '\n// Exports',
            ...exports,
            '\n// Functions',
            ...functions.map(f => `// ${f}`)
        ].join('\n');
    }

    private async processFiles(
        files: { [path: string]: string },
        branch: string
    ): Promise<ProjectStructure> {
        const tree = this.generateFileTree(files);
        const keyFiles: { [path: string]: string } = {};
        const abstractFiles: { [path: string]: string } = {};
        const configs: { [path: string]: any } = {};

        for (const [path, content] of Object.entries(files)) {
            if (this.isKeyFile(path)) {
                keyFiles[path] = content;
            } else if (path.endsWith('.json')) {
                try {
                    configs[path] = JSON.parse(content);
                } catch {
                    configs[path] = content;
                }
            } else {
                abstractFiles[path] = this.generateAbstractCode(content);
            }
        }

        return { tree, keyFiles, abstractFiles, configs };
    }

    // async downloadRepository(
    //     repoUrl: string,
    //     onProgress?: (progress: { loaded: number; total: number }) => void
    // ): Promise<{ files: ProjectStructure; branch: string }> {
    //     const { files, branch } = await this.downloadFiles(repoUrl, onProgress);
    //     const processedFiles = await this.processFiles(files, branch);
    //     return { files: processedFiles, branch };
    // }
}
