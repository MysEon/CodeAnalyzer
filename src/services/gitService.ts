import axios from 'axios';
import JSZip from 'jszip';
import { cacheService } from './MemoryCacheService';
import { messageService } from './messageService';
import { parse, ParserOptions } from '@babel/parser';
import traverse from '@babel/traverse';
import {
    ImportDeclaration,
    ExportDeclaration,
    FunctionDeclaration,
    ClassDeclaration,
    VariableDeclaration
} from '@babel/types';

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

    private getCacheKey(repoUrl: string): string {
        return `repo:${repoUrl}`;
    }


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
        let filesX: { files: { [key: string]: string }, branch: string } ;
        try {

            // 检查缓存
            const cacheKey = this.getCacheKey(url);
            const cachedData = cacheService.get<{ files: { [key: string]: string }; branch: string }>(cacheKey);

            if (cachedData) {
                messageService.show({
                type: 'info',
                content: '已从缓存中加载'
                });
                return cachedData;
            }
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
                    const textExtensions = [
                        // 前端
                        'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass', 'less', 'styl', 'html', 'htm', 'vue', 'svelte',

                        // 后端
                        'py', 'rb', 'php', 'java', 'go', 'rs', 'cs', 'sql', 'prisma',

                        // 配置
                        'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'config', 'env', 'properties',

                        // 文档
                        'md', 'txt', 'log', 'rst', 'adoc', 'wiki',

                        // 其他
                        'sh', 'bash', 'gitignore', 'dockerignore', 'lock', 'gradle'
                    ];

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
                    filesX = { files, branch: defaultBranch }
                    const cacheKey = this.getCacheKey(url);
                    cacheService.set(cacheKey, filesX);
                    messageService.show({
                        type: 'info',
                        content: '已存入缓存，有效时间30min'
                    });
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
        let prevParts: string[] = [];

        paths.forEach((currentPath, pathIndex) => {
            const currentParts = currentPath.split('/');

            // 计算与上一个路径的公共前缀层级
            let commonDepth = 0;
            while (
                commonDepth < currentParts.length &&
                commonDepth < prevParts.length &&
                currentParts[commonDepth] === prevParts[commonDepth]
            ) {
                commonDepth++;
            }

            // 生成每个层级的缩进和连接符
            for (let depth = commonDepth; depth < currentParts.length; depth++) {
                const isLastInParent = this.isLastChildInParent(
                    paths,
                    pathIndex,
                    currentParts,
                    depth
                );

                const indent = '  '.repeat(depth);
                const prefix = isLastInParent ? '└── ' : '├── ';

                // 只在该层级添加连接线
                tree += `${indent}${prefix}${currentParts[depth]}\n`;
            }

            prevParts = currentParts;
        });

        return tree;
    }

    /**
     * 判断当前节点是否是父层级下的最后一个子节点
     */
    private isLastChildInParent(
        allPaths: string[],
        currentIndex: number,
        currentParts: string[],
        targetDepth: number
    ): boolean {
        const parentPath = currentParts.slice(0, targetDepth).join('/');

        // 找到所有同父层级的节点
        const siblings = allPaths.filter(p => {
            const parts = p.split('/');
            return (
                parts.length > targetDepth &&
                parts.slice(0, targetDepth).join('/') === parentPath
            );
        });

        // 当前节点是否是最后一个
        return siblings[siblings.length - 1] === allPaths[currentIndex];
    }

    private isKeyFile(path: string): boolean {
        // 通用配置文件（所有项目类型）
        const configPatterns = [
            /(^|\/)(package|composer|Cargo|build|pom|build\.gradle|settings\.gradle|go\.mod|mix\.exs)\.(json|toml|lock|exs?|gradle|mod)$/i,
            /(^|\/)Dockerfile/,
            /(^|\/)(docker-compose|Jenkinsfile|\.github\/workflows\/)/,
            /(^|\/)(web|ts)config\.json$/,
            /(^|\/)\.env/,
            /(^|\/)Makefile/
        ];

        // 语言特定关键文件
        const languagePatterns = [
            // JavaScript/TypeScript
            /(^|\/)(index|App|main)\.[jt]sx?$/,
            /(^|\/)(vite|next|nuxt|gulp|webpack|rollup)\.config\.[jt]s$/,
            /(^|\/)_app\.(jsx?|tsx?)$/,

            // Python
            /(^|\/)(requirements|setup|pyproject|Pipfile|manage|main|app)\.(txt|py|toml)$/,
            /(^|\/)wsgi\.py$/,
            /(^|\/)(alembic|migrations)\/versions\//,

            // Java/Kotlin
            /(^|\/)src\/main\/[^/]+\/(Application|Main)\.(java|kt)$/,
            /(^|\/)build\.gradle\.kts$/,

            // Go
            /(^|\/)main\.go$/,
            /(^|\/)go\.(mod|sum)$/,

            // Rust
            /(^|\/)main\.rs$/,
            /(^|\/)lib\.rs$/,

            // PHP
            /(^|\/)index\.php$/,
            /(^|\/)artisan$/,

            // Ruby
            /(^|\/)Gemfile/,
            /(^|\/)Rakefile/,

            // C#
            /(^|\/)Program\.cs$/,
            /(^|\/)Startup\.cs$/,

            // 数据库相关
            /(^|\/)(migrations|seeders)\//,
            /(^|\/)(schema|dump)\.sql$/,

            // 前端框架特定
            /(^|\/)(app|layout|page|route)\.[jt]sx?$/,
            /(^|\/)(sitemap|robots)\.[jt]sx?$/,

            // 移动端
            /(^|\/)App\.(jsx?|tsx?)$/,
            /(^|\/)android\/app\/src\/main\//,
            /(^|\/)ios\/.*\.xcodeproj\//
        ];

        // 组件/模块入口（多语言适配）
        const modulePatterns = [
            /(^|\/)(components|lib|utils|services|controllers|models)\/[^/]+\/(index|main)\.[^/]+$/, // 通用模块入口
            /(^|\/)(__init__|mod)\.(py|rs)$/, // Python/Rust模块
            /(^|\/)routes\.[jt]sx?$/, // 路由配置
            /(^|\/)(middleware|providers)\// // 框架中间件
        ];

        return [
            ...configPatterns,
            ...languagePatterns,
            ...modulePatterns
        ].some(pattern => pattern.test(path));
    }

    private generateAbstractCode(content: string): string {
        try {
            // 配置解析器（支持TypeScript和JSX）
            const parserOptions: ParserOptions = {
                sourceType: 'module',
                plugins: [
                    'typescript',
                    'jsx',
                    'classProperties',
                    'decorators-legacy'
                ]
            };

            // 生成AST
            const ast = parse(content, parserOptions);

            // 收集代码结构元素
            const elements: string[] = [];
            let hasContent = false;

            traverse(ast, {
                // 处理导入语句
                ImportDeclaration(path) {
                    const source = path.node.source.value;
                    const specifiers = path.node.specifiers
                        .map(s => {
                            if (s.type === 'ImportDefaultSpecifier') {
                                return `default as ${s.local.name}`;
                            }
                            if (s.type === 'ImportNamespaceSpecifier') {
                                return `* as ${s.local.name}`;
                            }
                            return s.imported.name;
                        })
                        .join(', ');

                    elements.push(`IMPORT: ${specifiers} from '${source}'`);
                    hasContent = true;
                },

                // 处理导出声明
                ExportDeclaration(path) {
                    if (path.isExportNamedDeclaration()) {
                        const specifiers = path.node.specifiers
                            ?.map(s => s.exported.name)
                            .join(', ') || 'all';
                        const source = path.node.source?.value;

                        elements.push(
                            `EXPORT: { ${specifiers} }${source ? ` from '${source}'` : ''}`
                        );
                    } else if (path.isExportDefaultDeclaration()) {
                        elements.push('EXPORT: default');
                    }
                    hasContent = true;
                },

                // 处理函数声明
                FunctionDeclaration(path) {
                    const node = path.node;
                    const params = node.params
                        .map(p => (p as any).name || '{ pattern }')
                        .join(', ');

                    elements.push(
                        `FUNCTION: ${node.id?.name || 'anonymous'}(${params})`
                    );
                    hasContent = true;
                },

                // 处理类声明
                ClassDeclaration(path) {
                    elements.push(`CLASS: ${path.node.id.name}`);
                    hasContent = true;
                },

                // 处理箭头函数表达式
                ArrowFunctionExpression(path) {
                    if (path.parentPath.isVariableDeclarator()) {
                        const varName = (path.parentPath.node.id as any).name;
                        elements.push(`ARROW FUNCTION: ${varName}`);
                        hasContent = true;
                    }
                }
            });

            // 处理空文件情况
            if (!hasContent) {
                return '// No significant code structure found';
            }

            // 添加分类标题
            const categorized = elements.reduce((acc, line) => {
                const [type] = line.split(':');
                if (!acc[type]) acc[type] = [];
                acc[type].push(line.replace(`${type}: `, ''));
                return acc;
            }, {} as Record<string, string[]>);

            // 生成格式化输出
            return Object.entries(categorized)
                .map(([category, items]) =>
                    `// ${category}s\n${items.map(i => `// ${i}`).join('\n')}`
                )
                .join('\n\n');
        } catch (error) {
            // 解析失败时回退到简单实现
            return this.fallbackAbstractCode(content);
        }
    }

    private fallbackAbstractCode(content: string): string {
        const lines = content.split('\n');
        const elements: string[] = [];

        // 改进的正则匹配
        const importReg = /^(import|export)\s+.*/;
        const functionReg = /(function\s+\w+|=>|\bclass\s+\w+)/;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (importReg.test(trimmed)) {
                elements.push(`// IMPORT/EXPORT: ${trimmed.replace(/{|}/g, '').split(' ')[1]}`);
            } else if (functionReg.test(trimmed)) {
                elements.push(`// FUNCTION: ${trimmed.split('(')[0]}`);
            }
        });

        return elements.join('\n') || '// No recognizable code patterns';
    }

    public async processFiles(
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
