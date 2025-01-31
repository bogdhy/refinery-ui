import { capitalizeFirst, capitalizeFirstForClassName, enumToArray, getPythonClassName, getPythonFunctionName, isStringTrue, toPythonFunctionName } from "src/app/util/helper-functions"
import { BricksIntegratorComponent } from "../bricks-integrator.component"
import { BricksVariableComment, isCommentTrue } from "./comment-lookup";
import { BricksExpectedLabels, BricksVariable, bricksVariableNeedsTaskId, BricksVariableType, ExpectedLabel, getEmptyBricksExpectedLabels, getEmptyBricksVariable } from "./type-helper";
//currently included python types are: int, float, str, bool, list

export class BricksCodeParser {
    errors: string[] = [];
    variables: BricksVariable[] = [];
    globalComments: string[];
    baseCode: string;
    functionName: string;
    filterTypes: string[];
    labelingTaskName: string;

    labelingTasks: any[];
    expected: BricksExpectedLabels = getEmptyBricksExpectedLabels();
    nameTaken: boolean = false;

    constructor(private base: BricksIntegratorComponent) {
        this.filterTypes = enumToArray(BricksVariableType).filter(x => x != BricksVariableType.UNKNOWN && !x.startsWith("GENERIC"));
    }
    public prepareCode() {
        this.errors = [];
        this.expected = getEmptyBricksExpectedLabels();
        if (!this.base.config.api.data) return;

        this.baseCode = this.base.config.api.data.data.attributes.sourceCode;
        this.globalComments = this.collectGlobalComment();
        this.functionName = this.base.executionTypeFilter == "activeLearner" ? getPythonClassName(this.baseCode) : getPythonFunctionName(this.baseCode);
        this.checkFunctionNameAndSet(this.functionName);
        const variableLines = this.collectVariableLines();
        if (variableLines.length == 0) {
            this.base.config.preparedCode = this.baseCode;
            this.base.config.codeFullyPrepared = true;
        }
        try {
            this.variables = this.parseVariableLines(variableLines);
            this.replaceVariables();
        } catch (error) {
            this.errors.push(error);
            console.log("couldn't parse code", error);
        }
        if (this.base.labelingTaskId) {
            this.labelingTaskName = this.base.dataRequestor.getLabelingTaskAttribute(this.base.labelingTaskId, 'name');
            const taskType = this.base.dataRequestor.getLabelingTaskAttribute(this.base.labelingTaskId, 'taskType');
            this.labelingTasks = this.base.dataRequestor.getLabelingTasks(taskType);
        }
    }

    public replaceVariables() {
        let replacedCode = this.replaceFunctionLine(this.baseCode);
        for (let i = 0; i < this.variables.length; i++) {
            const variable = this.variables[i];
            this.prepareReplaceLine(variable);
            replacedCode = replacedCode.replace(variable.line, variable.replacedLine);
        }
        this.base.config.preparedCode = replacedCode;
        this.extendCodeForRecordIde();
        this.extendCodeForLabelMapping();
        this.base.config.codeFullyPrepared = this.variables.every(v => v.optional || (v.values.length > 0 && v.values.every(va => va != null)));
        this.base.config.canAccept = this.base.config.codeFullyPrepared && !this.nameTaken && this.functionName != "";

    }

    private parseExpectedLabelsComment(comment: string): string {
        if (!comment) return "";
        const labelStringMatch = comment.match(/\[(.*?)\]/);
        if (this.base.labelingTaskId) {
            if (labelStringMatch && labelStringMatch.length > 1) {
                const labels = labelStringMatch[1].split(",").map(x => x.replace(/\"/g, "").trim());
                if (labels && labels.length > 0) {

                    this.expected.expectedTaskLabels = [];
                    const existingLabels = this.base.dataRequestor.getLabels(this.base.labelingTaskId);
                    for (const label of labels) {
                        const existingLabel = existingLabels.find(x => x.name == label);
                        this.expected.expectedTaskLabels.push({
                            label: label,
                            exists: !!existingLabel,
                            backgroundColor: 'bg-' + (existingLabel ? existingLabel.color : 'gray') + '-100',
                            textColor: 'text-' + (existingLabel ? existingLabel.color : 'gray') + '-700',
                            borderColor: 'border-' + (existingLabel ? existingLabel.color : 'gray') + '-400'
                        });
                    }
                    this.expected.expectedTaskLabels.sort((a, b) => (-a.exists) - (-b.exists) || a.label.localeCompare(b.label));
                    this.expected.labelsToBeCreated = this.expected.expectedTaskLabels.filter(x => !x.exists).length;
                    this.expected.labelWarning = !this.expected.expectedTaskLabels[this.expected.expectedTaskLabels.length - 1].exists;
                    this.expected.canCreateTask = this.base.dataRequestor.getLabelingTaskAttribute(this.base.labelingTaskId, 'taskType') == 'MULTICLASS_CLASSIFICATION';
                }
                return ""; //task creation logic handled differently
            }
        } else {
            if (labelStringMatch && labelStringMatch.length > 0) {
                return "Will return " + labelStringMatch[0];
            }
        }
        return comment;
    }

    public activeLabelMapping() {
        this.expected.availableLabels = this.base.dataRequestor.getLabels(this.base.labelingTaskId);
        this.expected.labelMappingActive = true;
        for (const label of this.expected.expectedTaskLabels) {
            label.mappedLabel = label.exists ? label.label : null;
        }
        this.replaceVariables();
    }

    private extendCodeForLabelMapping() {
        if (!this.expected.labelMappingActive) return;
        if (this.functionName == null || this.functionName == "@@unknown@@") return;
        const isExtractor = this.base.config.api.data.data.attributes.moduleType == "extractor";

        const currentFunctionLine = this.getCurrentFunctionLine();
        if (!currentFunctionLine) {
            console.log("couldn't find function line");
            return;
        }

        let functionWrapper = currentFunctionLine + "\n";
        functionWrapper += "    #this is a wrapper to map the labels according to your specifications\n";
        if (isExtractor) {
            functionWrapper += "    for (result, start, end) in bricks_base_function(record):\n";
        } else {
            functionWrapper += "    result = bricks_base_function(record)\n";
        }
        functionWrapper += (isExtractor ? "    " : "") + "    if result in my_custom_mapping:\n";
        functionWrapper += (isExtractor ? "    " : "") + "        result = my_custom_mapping[result]\n";
        let mappingDict = "\n#generated by the bricks integrator\n";
        mappingDict += "my_custom_mapping = {\n";
        for (const label of this.expected.expectedTaskLabels) {
            if (label.mappedLabel != label.label) {
                if (label.mappedLabel == null) {
                    mappingDict += '    "' + label.label + '":None';
                } else {
                    mappingDict += '    "' + label.label + '":"' + label.mappedLabel + '"';
                }
                mappingDict += ",\n";
            }

        }
        mappingDict += "}";
        functionWrapper += (isExtractor ? "    " : "") + "    if result:\n";
        if (isExtractor) {
            functionWrapper += "            yield (result, start, end)\n";
        }
        else {
            functionWrapper += "        return result\n";
        }
        functionWrapper += "\ndef bricks_base_function(record):";
        this.base.config.preparedCode = this.base.config.preparedCode.replace(currentFunctionLine, functionWrapper) + mappingDict;
    }


    getCurrentFunctionLine(): string {
        const lines = this.base.config.preparedCode.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (this.base.executionTypeFilter == "activeLearner") {
                if (line.startsWith('class ' + this.functionName)) {
                    return line;
                }
            } else {
                if (line.startsWith('def ' + this.functionName + '(record')) {
                    return line;
                }
            }
        }
        return null;
    }

    getIndexFunctionLine(code: string): number {
        const lines = code.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            let functionNameBase = null;
            if (this.base.executionTypeFilter == "activeLearner") {
                functionNameBase = getPythonClassName(line);
                if (line.startsWith('class ' + functionNameBase)) {
                    return i;
                }
            } else {
                functionNameBase = getPythonFunctionName(line);
                if (line.startsWith('def ' + functionNameBase + '(record')) {
                    return i;
                }
            }
        }
        return -1;
    }

    private extendCodeForRecordIde() {
        if (!this.base.forIde) return;
        if (this.functionName == null || this.functionName == "@@unknown@@") return;
        const isExtractor = this.base.config.api.data.data.attributes.moduleType == "extractor";
        let printReturn = "\n\nprint(\"Record: \", record) \nprint(\"Result: \", ";
        if (isExtractor) {
            printReturn += "[v for v in " + this.functionName + "(record)])"
        } else {
            printReturn += this.functionName + "(record))"
        }
        this.base.config.preparedCode += printReturn;
    }

    private collectGlobalComment(): string[] {
        const lines = this.baseCode.split("\n");
        const commentLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("def ")) break;
            if (line.startsWith("#")) {
                let tmpLine = line.replace("#", "").trim();
                if (isCommentTrue(tmpLine, BricksVariableComment.TASK_REQUIRED_LABELS)) {
                    tmpLine = this.parseExpectedLabelsComment(tmpLine);
                }
                const idx = tmpLine.indexOf("[");
                if (idx > 0) {
                    const parts = tmpLine.split("[").map((x, i) => (i == 0 ? x : "[" + x).trim());
                    commentLines.push(...parts);
                }
                else commentLines.push(tmpLine);
            }
        }
        return commentLines.filter(x => x.trim() != "");
    }

    private prepareReplaceLine(variable: BricksVariable) {
        variable.replacedLine = variable.baseName;
        if (variable.pythonType) variable.replacedLine += ": " + variable.pythonType;
        variable.replacedLine += " = " + this.getValueString(variable);
        if (variable.comment) variable.replacedLine += " #" + variable.comment;

    }

    private getValueString(variable: BricksVariable): string {
        const realValues = variable.values.filter(v => v != null);
        if (realValues.length == 0) return "None";
        if (realValues.length == 1) {
            const v = this.getPythonVariable(realValues[0], variable.pythonType, variable.type);
            if (variable.canMultipleValues) return "[" + v + "]";
            return v;
        }
        return "[" + realValues.map(x => this.getPythonVariable(x, variable.pythonType, variable.type)).join(",") + "]";
    }

    private getPythonVariable(value: string, pythonType: string, bricksType: BricksVariableType) {
        if (value == null) return "None";
        if (bricksType == BricksVariableType.LOOKUP_LIST) return "knowledge." + value;
        if (bricksType == BricksVariableType.REGEX) return "r\"" + value + "\"";
        if (pythonType.includes("str")) return "\"" + value + "\"";
        return value;
    }

    private collectVariableLines(): string[] {

        const lines = this.baseCode.split("\n");
        const variableLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith("def ")) break;
            if (line.startsWith("YOUR_")) variableLines.push(line);
        }
        return variableLines;
    }

    private parseVariableLines(variableLines: string[]): BricksVariable[] {
        const variables = [];
        for (let i = 0; i < variableLines.length; i++) {
            const line = variableLines[i];
            const variable = this.parseVariableLine(line);
            variables.push(variable);
        }
        return variables;
    }
    private parseVariableLine(line: string): BricksVariable {
        const variable = getEmptyBricksVariable();
        variable.line = line;
        variable.baseName = variable.line.split("=")[0].split(":")[0].trim();
        variable.displayName = capitalizeFirst(variable.baseName.substring(5));
        variable.pythonType = line.split(":")[1].split("=")[0].trim();
        variable.canMultipleValues = variable.pythonType.toLowerCase().includes("list");
        variable.type = this.getVariableType(variable);
        const comment = line.split("#");
        if (comment.length > 1) {
            comment.shift();
            variable.comment = comment.join("#");
        }
        variable.allowedValues = this.getAllowedValues(variable.type, variable.comment);
        variable.optional = isCommentTrue(variable.comment, BricksVariableComment.GLOBAL_OPTIONAL);
        variable.values = this.getValues(variable);
        this.setAddOptions(variable);
        return variable;
    }

    private getValues(variable: BricksVariable): any[] {
        //parse variable value
        if (variable.type.startsWith("GENERIC_") || variable.type == BricksVariableType.REGEX) {

            const value = variable.line.split("=")[1].split("#")[0].trim();
            if (value == "None") return [null];
            if (value == "[]") return [null];
            if (value.charAt(0) == "[") {
                return value.substring(1, value.length - 1).split(",").map(x => this.parseValue(x, variable.pythonType));
            } else {
                return [this.parseValue(value, variable.pythonType)];
            }
        } else return [null];
    }
    private parseValue(value: string, pythonType: string): any {
        if (value.startsWith("r\"")) value = value.substring(1); //remove r for regex
        value = value.replace(/"/g, "").trim();
        if (pythonType.includes("int")) return parseInt(value);
        if (pythonType.includes("float")) return parseFloat(value);
        if (pythonType.includes("bool")) return isStringTrue(value);
        return value;
    }

    private setAddOptions(variable: BricksVariable) {
        if (variable.type == BricksVariableType.GENERIC_BOOLEAN) {
            variable.options.colors = [null];
        }
    }

    private getVariableType(variable: BricksVariable): BricksVariableType {
        //first try find a specific type
        const types = this.filterTypes;
        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            if (!this.base.labelingTaskId && bricksVariableNeedsTaskId(type as BricksVariableType)) continue;
            if (variable.baseName.includes(type)) return type as BricksVariableType;
        }
        //if no specific type is found, try to find a generic type
        if (variable.pythonType.includes("int")) return BricksVariableType.GENERIC_INT;
        else if (variable.pythonType.includes("float")) return BricksVariableType.GENERIC_FLOAT;
        else if (variable.pythonType.includes("str")) return BricksVariableType.GENERIC_STRING;
        else if (variable.pythonType.includes("bool")) return BricksVariableType.GENERIC_BOOLEAN;

        return BricksVariableType.UNKNOWN;

    }

    private getAllowedValues(forType: BricksVariableType, comment: string): any {
        switch (forType) {
            case BricksVariableType.LANGUAGE:
                const allLanguages = isCommentTrue(comment, BricksVariableComment.LANGUAGE_ALL);
                return this.base.dataRequestor.getIsoCodes(!allLanguages);
            case BricksVariableType.ATTRIBUTE:
                if (isCommentTrue(comment, BricksVariableComment.ATTRIBUTE_ONLY_TEXT)) return this.base.dataRequestor.getAttributes('TEXT');
                return this.base.dataRequestor.getAttributes(null);
            case BricksVariableType.LABELING_TASK:
                let typeFilter = null;
                if (isCommentTrue(comment, BricksVariableComment.LABELING_TASK_ONLY_CLASSIFICATION)) typeFilter = 'MULTICLASS_CLASSIFICATION';
                else if (isCommentTrue(comment, BricksVariableComment.LABELING_TASK_ONLY_EXTRACTION)) typeFilter = 'INFORMATION_EXTRACTION';
                return this.base.dataRequestor.getLabelingTasks(typeFilter);
            case BricksVariableType.LABEL:
                if (!this.base.labelingTaskId) {
                    console.log("no labeling task id given -> can't collect allowed labels");
                    return;
                }
                return this.base.dataRequestor.getLabels(this.base.labelingTaskId);
            case BricksVariableType.EMBEDDING:
                if (!this.base.labelingTaskId) {
                    return this.base.dataRequestor.getEmbeddings();
                }
                return this.base.dataRequestor.getEmbeddings(this.base.labelingTaskId);
            case BricksVariableType.LOOKUP_LIST:
                return this.base.dataRequestor.getLookupLists();
            default:
                return null;
        }
    }

    checkFunctionNameAndSet(name: string) {
        this.nameTaken = !!(this.base.nameLookups?.find(x => x == name));
        name = this.base.executionTypeFilter == "activeLearner" ? capitalizeFirstForClassName(name) : toPythonFunctionName(name);
        if (this.base.config.preparedCode) {
            this.functionName = name;
            this.replaceVariables();
        }
        this.base.checkCanAccept();
    }

    replaceFunctionLine(code: string): string {
        let replacedCode = code;
        const idxReplace = this.getIndexFunctionLine(code);
        if (idxReplace == -1) return replacedCode;
        const splitBase = code.split("\n");
        const getPythonName = this.base.executionTypeFilter == "activeLearner" ? getPythonClassName(splitBase[idxReplace]) : getPythonFunctionName(splitBase[idxReplace]);
        splitBase[idxReplace] = splitBase[idxReplace]?.replace(getPythonName, this.functionName);
        return splitBase.join("\n");
    }
}