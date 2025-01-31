import { FormArray } from "@angular/forms";

/**
 * Optionset for kern dropdown
 * @optionArray {string[] | FormArray[] | any[]} - Can be any array. string array is just used, FormArray or any object array tries to use "name" property then "text" last first string property
 * @buttonCaption {string, optional} - used as caption for the button, if not given the first / current value is used
 * @valuePropertyPath {string, optional} - if undefined option text is returned, else (e.g. name.tmp.xyz) the path is split and used to access the object property
 * @emitIndex {boolean, optional} - if enabled the index of the selected option is emitted instead of the value
 * @keepDropdownOpen {boolean, optional} - stops the event propagation of the click event and therfore keeps the menu open
 * @buttonTooltip {string, optional} - adds a tooltip if defined
 * @buttonTooltipPosition {string, optional} - if empty defaults to right otherwise tooltip + position (e.g. tooltip-left)
 * @buttonWhitespace {string, optional} - holds style parameter for whitespace handling (e.g. nowrap)
 * @isDisabled {boolean, optional} - disables the dropdown
 * @isOptionDisabled {boolean[], optional} - disables the dropdown option (needs to be the exact same length as the optionArray)
 * @optionTooltips {string[], optional} - adds a tooltip to the dropdown option (needs to be the exact same length as the optionArray - can hold null values)
 * @optionIcons {string[], optional} - displays a predfined icon if set for the index (needs to be the exact same length as the optionArray)
 * @hasCheckboxes {boolean, optional} - helper for checkbox like dropdowns (e.g. data browser)
 * @buttonVersion {string, optional} - defaults to 'default' (button with a caption text), '...', 'userIcon'
 * @avatarUri {string, optional} - link to the avatar image for logged user
 * @prefix {string, optional} - prefix to the main name in the option
 * @postfix {string, optional} - postfix to the main name in the option
 * @buttonBgColor {string, optional} - background color for the button
 * @buttonTextColor {string, optional} - text color for the button
 * @optionDescriptions {string, optional} - array with optional descriptions to the options
 * @hoverColor {string, optional} - background color on hover for the dropdown options
 * @textColor {string, optional} - text color for the dropdown options
 * @textHoverColor {string, optional} - text color on hover for the dropdown options
 * @textSize {string, optional} - text size for the dropdown options
 * @isButtonSampleProjects {boolean, optional} - checks if the button is the specific one for sample project
 * @isModelDownloaded {boolean[], optional} - checks if the model is downloaded and if so the color of the text is green
 * @emitEvent {boolean, optional} - checks if the event should be emitted (used for stopPropagation)
 * @addScrollXDropdownOptions {boolean, optional} - checks if the dropdown options should have a scrollX for longer texts with limitted space
 * @maxHeight {string, optional} - sets the max height of the dropdown options
 * @maxWidth {string, optional} - sets the max width of the dropdown options
 * @hasFullWidth {string, optional} - sets the width of the dropdown options and the button to 100%
 * @fontClass {string, optional} - sets the font class for whole dropdown
 * @backgroundColors {string, optional} - sets the background color for dropdown options (needs to be the exact same length as the optionArray - can hold null values)
 * @width {string, optional} - sets the width of the dropdown options
 * @tooltipMaxWidthClass {string, optional} - sets the max width of the tooltip - needs to be a class already existing in the css (eg 'tooltip_max_width_200)
*/
export type DropdownOptions = {
    optionArray: string[] | FormArray[] | any[];
    buttonCaption?: string;
    valuePropertyPath?: string;
    emitIndex?: boolean;
    keepDropdownOpen?: boolean;
    buttonTooltip?: string;
    buttonTooltipPosition?: string;
    buttonWhitespace?: string;
    isDisabled?: boolean;
    isOptionDisabled?: boolean[];
    optionTooltips?: string[];
    optionIcons?: string[];
    hasCheckboxes?: boolean;
    buttonVersion?: string;
    avatarUri?: string;
    prefix?: string;
    postfix?: string;
    buttonBgColor?: string;
    buttonTextColor?: string;
    optionDescriptions?: string[];
    hoverColor?: string;
    textColor?: string;
    textHoverColor?: string;
    textSize?: string;
    isButtonSampleProjects?: boolean;
    isModelDownloaded: boolean[];
    emitEvent: boolean;
    addScrollXDropdownOptions: boolean;
    maxHeight?: string;
    maxWidth?: string;
    hasFullWidth?: boolean;
    fontClass?: string;
    backgroundColors?: string[];
    width?: string;
    tooltipMaxWidthClass?: string;
};

