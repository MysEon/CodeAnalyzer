import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

interface FileAnalysis {
    imports: { source: string; path: string }[]; // 增加来源路径
    exports: string[];
    functions: {
        name: string;
        params: string[];
        complexity: number;
        lines: number;
    }[];
    classes: {
        name: string;
        methods: string[];
        properties: string[];
    }[];
    variables: string[];
    complexity: number;
}

interface ProjectAnalysis {
    files: { [path: string]: FileAnalysis };
    summary: {
        totalFiles: number;
        totalFunctions: number;
        totalClasses: number;
        totalLines: number;
        averageComplexity: number;
        dependencies: { [key: string]: string[] };
    };
}

export class CodeAnalyzer {
    private calculateComplexity(node: t.Node): number {
        let complexity = 1;

        traverse(node as any, {
            IfStatement: () => complexity++,
            ForStatement: () => complexity++,
            WhileStatement: () => complexity++,
            DoWhileStatement: () => complexity++,
            SwitchCase: () => complexity++,
            LogicalExpression: () => complexity++,
            ConditionalExpression: () => complexity++,
        });

        return complexity;
    }

    private analyzeFile(content: string, path: string): FileAnalysis {
        // 添加文件类型判断
        if (path.endsWith('.json')) {
            return this.analyzeConfigFile(content, path);
        }
        const analysis: FileAnalysis = {
            imports: [],
            exports: [],
            functions: [],
            classes: [],
            variables: [],
            complexity: 0
        };

        try {
            // 解析代码生成AST
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript', 'decorators-legacy'],
            });

            // 遍历AST
            traverse(ast as any, {
                // 分析导入
                ImportDeclaration: (path) => {
                    analysis.imports.push({
                        source: path.node.source.value,
                        path: path.hub.file.opts.filename // 获取当前文件路径
                    });
                },

                // 分析导出
                ExportNamedDeclaration: (path) => {
                    if (path.node.declaration) {
                        if (t.isVariableDeclaration(path.node.declaration)) {
                            path.node.declaration.declarations.forEach((dec) => {
                                if (t.isIdentifier(dec.id)) {
                                    analysis.exports.push(dec.id.name);
                                }
                            });
                        } else if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                            analysis.exports.push(path.node.declaration.id.name);
                        }
                    }
                },

                // 分析函数
                FunctionDeclaration: (path) => {
                    if (path.node.id) {
                        const functionName = path.node.id.name;
                        const params = path.node.params.map(param =>
                            t.isIdentifier(param) ? param.name : 'unknown'
                        );

                        // 计算函数复杂度
                        const complexity = this.calculateComplexity(path.node);

                        // 计算函数行数
                        const lines = path.node.loc ?
                            path.node.loc.end.line - path.node.loc.start.line + 1 : 0;

                        analysis.functions.push({
                            name: functionName,
                            params,
                            complexity,
                            lines
                        });
                    }
                },

                // 分析类
                ClassDeclaration: (path) => {
                    if (path.node.id) {
                        const className = path.node.id.name;
                        const methods: string[] = [];
                        const properties: string[] = [];

                        path.node.body.body.forEach((member) => {
                            if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
                                methods.push(member.key.name);
                            } else if (t.isClassProperty(member) && t.isIdentifier(member.key)) {
                                properties.push(member.key.name);
                            }
                        });

                        analysis.classes.push({
                            name: className,
                            methods,
                            properties
                        });
                    }
                },

                // 分析变量
                VariableDeclaration: (path) => {
                    path.node.declarations.forEach((dec) => {
                        if (t.isIdentifier(dec.id)) {
                            analysis.variables.push(dec.id.name);
                        }
                    });
                }
            });

            // 计算整体复杂度
            analysis.complexity = this.calculateComplexity(ast);

            return analysis;
        } catch (error) {
            console.error(`Error analyzing file ${path}:`, error);
            return analysis;
        }
    }

    private analyzeConfigFile(content: string, path: string): FileAnalysis {
        return {
            imports: [],
            exports: [],
            functions: [],
            classes: [],
            variables: [`config_${path.split('/').pop()}`],
            complexity: 1
        };
    }
    analyzeProject(files: { [path: string]: string }): ProjectAnalysis {
        const analysis: ProjectAnalysis = {
            files: {},
            summary: {
                totalFiles: 0,
                totalFunctions: 0,
                totalClasses: 0,
                totalLines: 0,
                averageComplexity: 0,
                dependencies: {} // 明确初始化为空对象
            }
        };

        // 分析文件时记录依赖关系
        for (const [path, content] of Object.entries(files)) {
            if (path.match(/\.(js|jsx|ts|tsx)$/)) {
                const fileAnalysis = this.analyzeFile(content, path);
                analysis.files[path] = fileAnalysis;

                // 更新依赖关系
                fileAnalysis.imports.forEach(({ source }) => {
                    if (!analysis.summary.dependencies[source]) {
                        analysis.summary.dependencies[source] = [];
                    }
                    if (!analysis.summary.dependencies[source].includes(path)) {
                        analysis.summary.dependencies[source].push(path);
                    }
                });
            }
        }

        // 生成项目总结
        let totalComplexity = 0;
        analysis.summary.totalFiles = Object.keys(analysis.files).length;

        for (const fileAnalysis of Object.values(analysis.files)) {
            analysis.summary.totalFunctions += fileAnalysis.functions.length;
            analysis.summary.totalClasses += fileAnalysis.classes.length;
            analysis.summary.totalLines += fileAnalysis.functions.reduce(
                (sum, fn) => sum + fn.lines, 0
            );
            totalComplexity += fileAnalysis.complexity;

            // 记录依赖关系
            fileAnalysis.imports.forEach(imp => {
                if (!analysis.summary.dependencies[imp]) {
                    analysis.summary.dependencies[imp] = [];
                }
            });
        }

        analysis.summary.averageComplexity = totalComplexity / analysis.summary.totalFiles;

        return analysis;
    }

    generateReport(analysis: ProjectAnalysis): string {
        let report = '代码分析报告\n';
        report += '='.repeat(50) + '\n\n';

        // 项目概览
        report += '项目概览:\n';
        report += '-'.repeat(20) + '\n';
        report += `总文件数: ${analysis.summary.totalFiles}\n`;
        report += `总函数数: ${analysis.summary.totalFunctions}\n`;
        report += `总类数: ${analysis.summary.totalClasses}\n`;
        report += `总代码行数: ${analysis.summary.totalLines}\n`;
        report += `平均复杂度: ${analysis.summary.averageComplexity.toFixed(2)}\n\n`;

        // 依赖分析
        report += '依赖关系:\n';
        report += '-'.repeat(20) + '\n';
        Object.entries(analysis.summary.dependencies).forEach(([dep, files]) => {
            report += `${dep} 被以下文件引用:\n`;
            files.forEach(file => report += `  - ${file}\n`);
        });
        report += '\n';

        // 文件详细分析
        report += '文件详细分析:\n';
        report += '-'.repeat(20) + '\n';
        Object.entries(analysis.files).forEach(([path, fileAnalysis]) => {
            report += `\n文件: ${path}\n`;
            report += `复杂度: ${fileAnalysis.complexity}\n`;

            if (fileAnalysis.functions.length > 0) {
                report += '\n函数:\n';
                fileAnalysis.functions.forEach(fn => {
                    report += `  ${fn.name}:\n`;
                    report += `    参数: ${fn.params.join(', ')}\n`;
                    report += `    复杂度: ${fn.complexity}\n`;
                    report += `    行数: ${fn.lines}\n`;
                });
            }

            if (fileAnalysis.classes.length > 0) {
                report += '\n类:\n';
                fileAnalysis.classes.forEach(cls => {
                    report += `  ${cls.name}:\n`;
                    report += `    方法: ${cls.methods.join(', ')}\n`;
                    report += `    属性: ${cls.properties.join(', ')}\n`;
                });
            }
        });

        return report;
    }
}
