const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

/**
 * Simple ID Card Generator
 * Overlays student information directly on PNG template images
 */

class SimpleIDCardGenerator {
  constructor() {
    this.templatesDir = path.join(__dirname, '..', 'idcard-templates');
    this.outputDir = path.join(__dirname, '..', 'uploads', 'generated-idcards');
  }

  /**
   * Calculate optimal font size and chars per line to prevent overflow
   */
  calculateOptimalTextSize(text, options = {}) {
    const {
      fontSize = 24,
      maxWidth = 400,
      maxCharsPerLine = 40,
      minFontSize = 12,
      maxLines = 2
    } = options;

    let currentFontSize = fontSize;
    let currentCharsPerLine = maxCharsPerLine;
    const textLength = String(text).length;

    // If text is short enough, use original settings
    if (textLength <= maxCharsPerLine) {
      return { fontSize: currentFontSize, maxCharsPerLine: currentCharsPerLine };
    }

    // Calculate how many lines we'd need with current settings
    let lines = this.wrapText(text, currentCharsPerLine);

    // If text exceeds maxLines, reduce font size and increase chars per line
    while (lines.length > maxLines && currentFontSize > minFontSize) {
      // Reduce font size by 10%
      currentFontSize = Math.max(minFontSize, Math.floor(currentFontSize * 0.9));

      // Increase chars per line proportionally (15% increase for better fitting)
      currentCharsPerLine = Math.floor(currentCharsPerLine * 1.15);

      // Recalculate lines
      lines = this.wrapText(text, currentCharsPerLine);
    }

    return { fontSize: currentFontSize, maxCharsPerLine: currentCharsPerLine };
  }

  /**
   * Wrap text into multiple lines based on maxWidth
   * Supports different char limits for first line vs subsequent lines
   */
  wrapText(text, maxCharsPerLine = 40, subsequentMaxCharsPerLine = null) {
    if (!text) return [];

    // Ensure text is a string and handle undefined/null
    const safeText = String(text || '').trim();
    if (!safeText) return [];

    const words = safeText.split(' ');
    const lines = [];
    let currentLine = '';
    let currentMaxChars = maxCharsPerLine;

    for (const word of words) {
      // Update max chars for subsequent lines
      if (lines.length > 0 && subsequentMaxCharsPerLine) {
        currentMaxChars = subsequentMaxCharsPerLine;
      }

      // If the word itself is longer than currentMaxChars, break it
      if (word.length > currentMaxChars) {
        // Push current line if it exists
        if (currentLine) {
          lines.push(currentLine.trim());
          currentLine = '';
          // Update max chars after pushing first line
          if (lines.length > 0 && subsequentMaxCharsPerLine) {
            currentMaxChars = subsequentMaxCharsPerLine;
          }
        }

        // Break the long word into chunks
        let remainingWord = word;
        while (remainingWord.length > currentMaxChars) {
          lines.push(remainingWord.substring(0, currentMaxChars));
          remainingWord = remainingWord.substring(currentMaxChars);
          // Update max chars for next iteration
          if (subsequentMaxCharsPerLine) {
            currentMaxChars = subsequentMaxCharsPerLine;
          }
        }
        currentLine = remainingWord;
      } else {
        const testLine = currentLine ? `${currentLine} ${word}` : word;

        if (testLine.length <= currentMaxChars) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine.trim());
            // Update max chars after pushing first line
            if (lines.length > 0 && subsequentMaxCharsPerLine) {
              currentMaxChars = subsequentMaxCharsPerLine;
            }
          }
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    return lines;
  }

  /**
   * Create multi-line text as SVG buffer for sharp composite
   * Returns either a single buffer or an array of {buffer, top, left} objects for special positioning
   */
  createMultiLineTextSVG(text, options = {}) {
    const {
      fontSize = 24,
      fontFamily = 'Arial',
      color = '#000000',
      fontWeight = 'bold',
      maxWidth = 400,
      lineHeight = 1.2,
      maxCharsPerLine = 40,
      textAlign = 'left',
      firstLineX = null,
      subsequentLinesX = null,
      subsequentMaxCharsPerLine = null
    } = options;

    // Wrap text into multiple lines (with different char limits for first vs subsequent lines)
    const lines = this.wrapText(text, maxCharsPerLine, subsequentMaxCharsPerLine);

    // Calculate total height needed
    const totalHeight = lines.length * fontSize * lineHeight + 10;

    // Special case: landscape address with different X positions for first vs subsequent lines
    // Return metadata instead of a single buffer
    if (firstLineX !== null && subsequentLinesX !== null && lines.length > 1) {
      return {
        isMultiPosition: true,
        lines: lines,
        fontSize: fontSize,
        fontFamily: fontFamily,
        color: color,
        fontWeight: fontWeight,
        lineHeight: lineHeight,
        firstLineX: firstLineX,
        subsequentLinesX: subsequentLinesX,
        maxWidth: maxWidth
      };
    }

    // Standard multi-line text (all lines at same X position)
    const svgWidth = maxWidth;

    // Create SVG with multiple text elements
    const textElements = lines.map((line, index) => {
      const escapedLine = String(line)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      const y = fontSize + (index * fontSize * lineHeight);

      // Calculate x position based on alignment
      let x = 0;
      if (textAlign === 'center') {
        // Approximate text width (rough estimation: 0.6 * fontSize per character)
        const estimatedWidth = line.length * fontSize * 0.6;
        x = (maxWidth - estimatedWidth) / 2;
      }

      return `<text 
        x="${x}" 
        y="${y}" 
        font-family="${fontFamily}" 
        font-size="${fontSize}px" 
        font-weight="${fontWeight}"
        fill="${color}"
      >${escapedLine}</text>`;
    }).join('\n');

    const svg = `
      <svg width="${svgWidth}" height="${totalHeight}">
        ${textElements}
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Create text as SVG buffer for sharp composite (single line)
   */
  createTextSVG(text, options = {}) {
    const {
      fontSize = 24,
      fontFamily = 'Arial',
      color = '#000000',
      fontWeight = 'bold',
      maxWidth = 400
    } = options;

    // Escape XML special characters
    const escapedText = String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const svg = `
      <svg width="${maxWidth}" height="${fontSize + 10}">
        <text 
          x="0" 
          y="${fontSize}" 
          font-family="${fontFamily}" 
          font-size="${fontSize}px" 
          font-weight="${fontWeight}"
          fill="${color}"
        >${escapedText}</text>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Get field positions based on orientation and side
   */
  getFieldPositions(orientation, side) {
    if (orientation === 'landscape' && side === 'front') {
      return {
        schoolLogo: { x: 130, y: 80, width: 80, height: 80 },
        schoolName: { x: 230, y: 80, fontSize: 30, fontWeight: 'bold', maxWidth: 700, multiLine: true, maxCharsPerLine: 70, lineHeight: 1.1, minFontSize: 18, maxLines: 2, autoSize: true, dynamicHeight: true },
        schoolAddress: { x: 230, y: 130, fontSize: 16, fontWeight: 'normal', maxWidth: 700, multiLine: true, maxCharsPerLine: 90, lineHeight: 1.0, minFontSize: 12, maxLines: 2, autoSize: true, dynamicY: true, baseY: 105, dependsOn: 'schoolName' },
        photo: { x: 75, y: 185, width: 235, height: 300 },
        nameLabel: { x: 330, y: 203, fontSize: 24, fontWeight: 'bold', dynamicX: true },
        name: { x: 530, y: 203, fontSize: 24, fontWeight: 'bold', maxWidth: 550, multiLine: true, maxCharsPerLine: 30, lineHeight: 1.2, maxLines: 3, dynamicX: true },
        idNumberLabel: { x: 330, y: 253, fontSize: 24, fontWeight: 'bold', dynamicX: true },
        idNumber: { x: 530, y: 253, fontSize: 24, dynamicX: true },
        classSectionLabel: { x: 330, y: 302, fontSize: 24, fontWeight: 'bold', dynamicX: true },
        classSection: { x: 530, y: 302, fontSize: 24, dynamicX: true },
        dobLabel: { x: 330, y: 348, fontSize: 24, fontWeight: 'bold', dynamicX: true },
        dob: { x: 530, y: 348, fontSize: 24, dynamicX: true },
        bloodGroup: { x: 415, y: 480, fontSize: 20, fontWeight: 'bold', color: '#000000', textAlign: 'center', maxWidth: 60, centerX: true }
      };
    } else if (orientation === 'landscape' && side === 'back') {
      return {
        address: { x: 400, y: 116, fontSize: 20, fontWeight: 'bold', maxWidth: 650, multiLine: true, maxCharsPerLine: 52, lineHeight: 1.3, minFontSize: 16, maxLines: 4, autoSize: false },
        mobile: { x: 520, y: 183, fontSize: 23, fontWeight: 'bold', maxWidth: 200 },
        returnSchoolName: { x: 170, y: 415, fontSize: 23, fontWeight: 'bold', maxWidth: 750, multiLine: true, maxCharsPerLine: 50, lineHeight: 1.2, minFontSize: 16, maxLines: 2, autoSize: true, textAlign: 'center' },
        returnAddress: { x: 170, y: 450, fontSize: 23, fontWeight: 'bold', maxWidth: 750, multiLine: true, maxCharsPerLine: 50, lineHeight: 1.2, minFontSize: 16, maxLines: 2, autoSize: true, textAlign: 'center' },
        schoolPhone: { x: 270, y: 510, fontSize: 20, fontWeight: 'bold', maxWidth: 650 },
        schoolEmail: { x: 470, y: 510, fontSize: 20, fontWeight: 'bold', maxWidth: 650 }
      };
    } else if (orientation === 'portrait' && side === 'front') {
      return {
        schoolLogo: { x: 30, y: 60, width: 80, height: 80 },
        schoolName: { x: 125, y: 55, fontSize: 24, fontWeight: 'bold', maxWidth: 400, multiLine: true, maxCharsPerLine: 25, lineHeight: 1.2, minFontSize: 24, maxLines: 3, autoSize: false, dynamicHeight: true },
        schoolAddress: { x: 125, y: 95, fontSize: 12, fontWeight: 'normal', maxWidth: 500, multiLine: true, maxCharsPerLine: 65, lineHeight: 1.2, minFontSize: 12, maxLines: 3, autoSize: false, dynamicY: true, baseY: 95, dependsOn: 'schoolName' },
        photo: { x: 175, y: 195, width: 240, height: 300 },
        nameLabel: { x: 50, y: 557, fontSize: 22, fontWeight: 'bold', baseValueX: 140 },
        name: { x: 170, y: 557, fontSize: 22, fontWeight: 'bold', maxWidth: 500, multiLine: true, maxCharsPerLine: 35, lineHeight: 1.2, maxLines: 3, dynamicX: true },
        idNumberLabel: { x: 50, y: 605, fontSize: 22, fontWeight: 'bold', baseValueX: 140 },
        idNumber: { x: 170, y: 605, fontSize: 22, fontWeight: 'bold', dynamicX: true },
        classSectionLabel: { x: 50, y: 655, fontSize: 22, fontWeight: 'bold', baseValueX: 140 },
        classSection: { x: 170, y: 655, fontSize: 22, fontWeight: 'bold', dynamicX: true },
        dobLabel: { x: 50, y: 700, fontSize: 22, fontWeight: 'bold', baseValueX: 140 },
        dob: { x: 170, y: 700, fontSize: 22, fontWeight: 'bold', dynamicX: true },
        bloodGroup: { x: 80, y: 345, fontSize: 22, fontWeight: 'bold', color: '#000000', textAlign: 'center', maxWidth: 60, centerX: true }
      };
    } else if (orientation === 'portrait' && side === 'back') {
      return {
        address: { x: 50, y: 106, fontSize: 22, fontWeight: 'bold', maxWidth: 550, multiLine: true, maxCharsPerLine: 40, lineHeight: 1.3, minFontSize: 22, maxLines: 5, autoSize: false, textAlign: 'center', dynamicHeight: true },
        mobile: { x: 295, y: 202, fontSize: 22, fontWeight: 'bold' },
        returnSchoolName: { x: 50, y: 540, fontSize: 20, fontWeight: 'bold', maxWidth: 500, multiLine: true, maxCharsPerLine: 35, lineHeight: 1.15, minFontSize: 20, maxLines: 3, autoSize: false, dynamicHeight: true, dynamicY: true, baseY: 540, textAlign: 'center' },
        returnAddress: { x: 50, y: 600, fontSize: 20, fontWeight: 'bold', maxWidth: 500, multiLine: true, maxCharsPerLine: 35, lineHeight: 1.15, minFontSize: 20, maxLines: 3, autoSize: false, dynamicHeight: true, dynamicY: true, baseY: 600, dependsOn: 'returnSchoolName', textAlign: 'center' },
        schoolPhone: { x: 50, y: 650, fontSize: 20, fontWeight: 'bold', maxWidth: 500, multiLine: true, maxCharsPerLine: 35, lineHeight: 1.15, dynamicY: true, baseY: 650, dependsOn: 'returnAddress', textAlign: 'center' },
        schoolEmail: { x: 50, y: 690, fontSize: 20, fontWeight: 'bold', maxWidth: 500, multiLine: true, maxCharsPerLine: 35, lineHeight: 1.15, dynamicY: true, baseY: 690, dependsOn: 'schoolPhone', textAlign: 'center' }
      };
    }
    return {};
  }

  /**
   * Generate a single ID card
   */
  async generateIDCard(student, orientation = 'landscape', side = 'front', schoolInfo = {}) {
    try {
      console.log(`🎨 Generating ${orientation} ${side} ID card for:`, {
        name: student.name,
        id: student._id,
        orientation,
        side,
        hasPhoto: !!student.profileImage
      });

      // Get template path
      const templatePath = path.join(this.templatesDir, `${orientation}-${side}.png`);

      console.log(`📁 Looking for template at: ${templatePath}`);

      // Check if template exists
      try {
        await fs.access(templatePath);
        console.log(`✅ Template found: ${orientation}-${side}.png`);
      } catch (error) {
        console.error(`❌ Template not found: ${templatePath}`);
        console.error(`❌ Templates directory: ${this.templatesDir}`);
        throw new Error(`Template not found: ${orientation}-${side}.png. Please add it to backend/idcard-templates/`);
      }

      // Read template
      const templateBuffer = await fs.readFile(templatePath);

      // Get field positions
      const positions = this.getFieldPositions(orientation, side);

      // Track field heights for dynamic positioning (portrait cards)
      const fieldHeights = {};

      // Prepare composite layers
      const compositeImages = [];

      // Add school logo (FRONT SIDE ONLY)
      if (side === 'front' && positions.schoolLogo && schoolInfo.logoUrl) {
        try {
          let logoPath = schoolInfo.logoUrl;
          let logoBuffer;

          // Check if it's a Cloudinary URL or external URL
          if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
            // Fetch from URL (Cloudinary or external)
            const axios = require('axios');
            const response = await axios.get(logoPath, { responseType: 'arraybuffer' });
            logoBuffer = Buffer.from(response.data);
            console.log(`✅ Fetched school logo from URL: ${logoPath}`);
          } else {
            // Handle relative paths (local files)
            if (logoPath.startsWith('/uploads')) {
              logoPath = path.join(__dirname, '..', logoPath);
            }
            // Check if file exists
            await fs.access(logoPath);
            logoBuffer = await fs.readFile(logoPath);
            console.log(`✅ Loaded school logo from local: ${logoPath}`);
          }

          // Resize and add logo
          const resizedLogoBuffer = await sharp(logoBuffer)
            .resize(positions.schoolLogo.width, positions.schoolLogo.height, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toBuffer();

          compositeImages.push({
            input: resizedLogoBuffer,
            top: positions.schoolLogo.y,
            left: positions.schoolLogo.x
          });
        } catch (logoError) {
          console.warn('⚠️ School logo processing skipped:', logoError.message);
        }
      }

      // Add school name (FRONT SIDE ONLY)
      if (side === 'front' && positions.schoolName && schoolInfo.schoolName) {
        let fontSize = positions.schoolName.fontSize;
        let maxCharsPerLine = positions.schoolName.maxCharsPerLine || 40;
        let yPosition = positions.schoolName.y;
        let allowMultiLine = false;

        // Auto-size if enabled
        if (positions.schoolName.autoSize) {
          // Step 1: Try to fit in 1 line first
          let optimal = this.calculateOptimalTextSize(schoolInfo.schoolName, {
            fontSize: positions.schoolName.fontSize,
            maxWidth: positions.schoolName.maxWidth,
            maxCharsPerLine: positions.schoolName.maxCharsPerLine,
            minFontSize: positions.schoolName.minFontSize || 12,
            maxLines: 1
          });

          // Check if text still doesn't fit in 1 line even after reduction
          const lines = this.wrapText(schoolInfo.schoolName, optimal.maxCharsPerLine);

          if (lines.length > 1) {
            // Step 2: Text needs 2 lines, recalculate with maxLines: 2
            optimal = this.calculateOptimalTextSize(schoolInfo.schoolName, {
              fontSize: optimal.fontSize, // Start from already reduced size
              maxWidth: positions.schoolName.maxWidth,
              maxCharsPerLine: optimal.maxCharsPerLine,
              minFontSize: positions.schoolName.minFontSize || 12,
              maxLines: 2
            });

            // Move text up proportionally to accommodate second line
            const lift = Math.round((optimal.fontSize || positions.schoolName.fontSize) * 0.45);
            yPosition = Math.max(positions.schoolName.y - lift, 45);
            allowMultiLine = true;
          }

          fontSize = optimal.fontSize;
          maxCharsPerLine = optimal.maxCharsPerLine;
        }

        const textMethod = (allowMultiLine || positions.schoolName.multiLine) ? 'createMultiLineTextSVG' : 'createTextSVG';

        // Calculate number of lines for height tracking
        const schoolNameLines = this.wrapText(schoolInfo.schoolName, maxCharsPerLine);
        const schoolNameHeight = schoolNameLines.length * fontSize * (positions.schoolName.lineHeight || 1.2);

        compositeImages.push({
          input: this[textMethod](schoolInfo.schoolName, {
            fontSize: fontSize,
            color: '#000000',
            fontWeight: positions.schoolName.fontWeight || 'bold',
            maxWidth: positions.schoolName.maxWidth || 400,
            maxCharsPerLine: maxCharsPerLine,
            lineHeight: positions.schoolName.lineHeight || 1.2
          }),
          top: Math.round(yPosition),
          left: positions.schoolName.x
        });

        // Store height for dynamic positioning
        fieldHeights['schoolName'] = {
          y: yPosition,
          height: schoolNameHeight,
          bottomY: yPosition + schoolNameHeight
        };
      }

      // Add school address (FRONT SIDE ONLY)
      if (side === 'front' && positions.schoolAddress && schoolInfo.address) {
        let fontSize = positions.schoolAddress.fontSize;
        let maxCharsPerLine = positions.schoolAddress.maxCharsPerLine || 35;

        // Calculate dynamic Y position if dependsOn is set
        let yPosition = positions.schoolAddress.y;
        if (positions.schoolAddress.dynamicY && positions.schoolAddress.dependsOn && fieldHeights[positions.schoolAddress.dependsOn]) {
          const dependentField = fieldHeights[positions.schoolAddress.dependsOn];
          yPosition = dependentField.bottomY + 5; // 5px gap
        }

        // Auto-size if enabled
        if (positions.schoolAddress.autoSize) {
          const optimal = this.calculateOptimalTextSize(schoolInfo.address, {
            fontSize: positions.schoolAddress.fontSize,
            maxWidth: positions.schoolAddress.maxWidth,
            maxCharsPerLine: positions.schoolAddress.maxCharsPerLine,
            minFontSize: positions.schoolAddress.minFontSize || 12,
            maxLines: positions.schoolAddress.maxLines || 2
          });
          fontSize = optimal.fontSize;
          maxCharsPerLine = optimal.maxCharsPerLine;
        }

        const textMethod = positions.schoolAddress.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';
        compositeImages.push({
          input: this[textMethod](schoolInfo.address, {
            fontSize: fontSize,
            color: '#333333',
            fontWeight: positions.schoolAddress.fontWeight || 'normal',
            maxWidth: positions.schoolAddress.maxWidth || 400,
            maxCharsPerLine: maxCharsPerLine,
            lineHeight: positions.schoolAddress.lineHeight || 1.2
          }),
          top: Math.round(yPosition),
          left: positions.schoolAddress.x
        });
      }

      // Add student photo (front side only)
      if (side === 'front' && positions.photo && student.profileImage) {
        try {
          let photoPath = student.profileImage;
          let photoBuffer;

          // Check if it's a Cloudinary URL or external URL
          if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
            // Fetch from URL (Cloudinary or external)
            const axios = require('axios');
            const response = await axios.get(photoPath, { responseType: 'arraybuffer' });
            photoBuffer = Buffer.from(response.data);
            console.log(`✅ Fetched student photo from URL: ${photoPath.substring(0, 50)}...`);
          } else {
            // Handle relative paths (local files)
            if (photoPath.startsWith('/uploads')) {
              photoPath = path.join(__dirname, '..', photoPath);
            }
            // Check if file exists
            await fs.access(photoPath);
            photoBuffer = await fs.readFile(photoPath);
            console.log(`✅ Loaded student photo from local: ${photoPath}`);
          }

          // Resize and add photo
          const resizedPhotoBuffer = await sharp(photoBuffer)
            .resize(positions.photo.width, positions.photo.height, {
              fit: 'cover',
              position: 'center'
            })
            .toBuffer();

          compositeImages.push({
            input: resizedPhotoBuffer,
            top: positions.photo.y,
            left: positions.photo.x
          });
        } catch (photoError) {
          console.warn('⚠️ Student photo processing skipped:', photoError.message);
          console.warn('Photo path:', student.profileImage);
        }
      }

      // Add text fields based on side
      if (side === 'front') {
        // Front side fields - Add labels and values

        // Calculate name lines to determine if we need to adjust other field positions
        let nameLines = 1;
        let nameYPosition = positions.name.y;
        let nameExtraHeight = 0;
        const isPortrait = orientation === 'portrait';
        const isLandscape = orientation === 'landscape';
        let portraitShortName = false;
        let portraitScale = 1.0;
        let belowNameExtraSpacing = 0;
        let landscapeShortName = false;
        let landscapeLabelShift = 0;
        let landscapeValueShift = 0;
        let portraitValueXShift = 0;
        let portraitLongName = false;
        let portraitLabelLeftShift = 0;

        if (positions.name && student.name) {
          const lines = this.wrapText(student.name, positions.name.maxCharsPerLine);
          nameLines = Math.min(lines.length, positions.name.maxLines || 3);

          // If name takes more than 1 line, calculate extra height needed
          if (nameLines > 1) {
            // Round to integer to avoid Sharp library errors
            nameExtraHeight = Math.round((nameLines - 1) * positions.name.fontSize * (positions.name.lineHeight || 1.2));
          }

          // Portrait enhancement: if name is a single short line, enlarge labels/values
          if (isPortrait && nameLines === 1 && String(student.name).length <= 14) {
            portraitShortName = true;
            portraitScale = 1.3; // 30% larger for better balance
            // No extra vertical spacing needed - keep fields at normal positions
            belowNameExtraSpacing = 0;
            // Increase gap between label and value to prevent overlap with larger fonts
            portraitValueXShift = Math.round(positions.nameLabel.fontSize * (portraitScale - 1) * 7.5); // Extra 36px shift for 30% scale (22 * 0.3 * 5.5 = 36.3px)
          }

          // Portrait enhancement: if name is long (multi-line or >25 chars), shift labels and values left to give more room
          if (isPortrait && (nameLines > 1 || String(student.name).length > 25)) {
            portraitLongName = true;
            portraitLabelLeftShift = -15; // Shift labels 15px to the left for long names
            portraitValueXShift = -15; // Shift values 15px to the left as well for long names
          }

          // Landscape enhancement: if name is short, shift labels and values to the right
          if (isLandscape && nameLines === 1 && String(student.name).length <= 18) {
            landscapeShortName = true;
            landscapeLabelShift = 50; // Shift labels 50px to the right
            landscapeValueShift = 50; // Shift values 50px to the right
          }
        }

        // Add "Name:" label
        if (positions.nameLabel) {
          let labelX = positions.nameLabel.x;
          if (landscapeShortName && positions.nameLabel.dynamicX) {
            labelX += landscapeLabelShift;
          } else if (portraitLongName) {
            labelX += portraitLabelLeftShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG('Name:', {
              fontSize: portraitShortName ? Math.round(positions.nameLabel.fontSize * portraitScale) : positions.nameLabel.fontSize,
              color: '#000000',
              fontWeight: positions.nameLabel.fontWeight || 'bold'
            }),
            top: positions.nameLabel.y,
            left: labelX
          });
        }

        // Add student name (multi-line support without font size reduction)
        if (positions.name && student.name) {
          const textMethod = positions.name.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';
          let nameX = positions.name.x;
          if (landscapeShortName && positions.name.dynamicX) {
            nameX += landscapeValueShift;
          } else if (portraitShortName && positions.name.dynamicX) {
            nameX += portraitValueXShift;
          } else if (portraitLongName && positions.name.dynamicX) {
            nameX += portraitValueXShift; // Shift left for long names
          }

          compositeImages.push({
            input: this[textMethod](student.name, {
              fontSize: portraitShortName ? Math.round(positions.name.fontSize * portraitScale) : positions.name.fontSize,
              color: '#000000',
              fontWeight: 'bold',
              maxWidth: positions.name.maxWidth,
              maxCharsPerLine: positions.name.maxCharsPerLine,
              lineHeight: positions.name.lineHeight || 1.2
            }),
            top: nameYPosition,
            left: nameX
          });
        }

        // Add "Seq. No:" label (adjust position if name is multi-line)
        if (positions.idNumberLabel) {
          let labelX = positions.idNumberLabel.x;
          if (landscapeShortName && positions.idNumberLabel.dynamicX) {
            labelX += landscapeLabelShift;
          } else if (portraitLongName) {
            labelX += portraitLabelLeftShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG('Seq. No:', {
              fontSize: portraitShortName ? Math.round(positions.idNumberLabel.fontSize * portraitScale) : positions.idNumberLabel.fontSize,
              color: '#000000',
              fontWeight: positions.idNumberLabel.fontWeight || 'bold'
            }),
            top: positions.idNumberLabel.y + nameExtraHeight + belowNameExtraSpacing,
            left: labelX
          });
        }

        // Add student ID value (adjust position if name is multi-line)
        if (positions.idNumber) {
          let valueX = positions.idNumber.x;
          if (landscapeShortName && positions.idNumber.dynamicX) {
            valueX += landscapeValueShift;
          } else if (portraitShortName && positions.idNumber.dynamicX) {
            valueX += portraitValueXShift;
          } else if (portraitLongName && positions.idNumber.dynamicX) {
            valueX += portraitValueXShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG(student.sequenceId || student.rollNumber || student._id, {
              fontSize: portraitShortName ? Math.round(positions.idNumber.fontSize * portraitScale) : positions.idNumber.fontSize,
              color: '#000000',
              fontWeight: 'bold'
            }),
            top: positions.idNumber.y + nameExtraHeight + belowNameExtraSpacing,
            left: valueX
          });
        }

        // Add "Class/Section:" label (adjust position if name is multi-line)
        if (positions.classSectionLabel) {
          let labelX = positions.classSectionLabel.x;
          if (landscapeShortName && positions.classSectionLabel.dynamicX) {
            labelX += landscapeLabelShift;
          } else if (portraitLongName) {
            labelX += portraitLabelLeftShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG('Class:', {
              fontSize: portraitShortName ? Math.round(positions.classSectionLabel.fontSize * portraitScale) : positions.classSectionLabel.fontSize,
              color: '#000000',
              fontWeight: positions.classSectionLabel.fontWeight || 'bold'
            }),
            top: positions.classSectionLabel.y + nameExtraHeight + belowNameExtraSpacing,
            left: labelX
          });
        }

        // Class/Section field (adjust position if name is multi-line)
        if (positions.classSection && student.className && student.section) {
          let valueX = positions.classSection.x;
          if (landscapeShortName && positions.classSection.dynamicX) {
            valueX += landscapeValueShift;
          } else if (portraitShortName && positions.classSection.dynamicX) {
            valueX += portraitValueXShift;
          } else if (portraitLongName && positions.classSection.dynamicX) {
            valueX += portraitValueXShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG(`${student.className} - ${student.section}`, {
              fontSize: portraitShortName ? Math.round(positions.classSection.fontSize * portraitScale) : positions.classSection.fontSize,
              color: '#000000',
              fontWeight: 'bold'
            }),
            top: positions.classSection.y + nameExtraHeight + belowNameExtraSpacing,
            left: valueX
          });
        } else if (positions.classSection && student.className) {
          let valueX = positions.classSection.x;
          if (landscapeShortName && positions.classSection.dynamicX) {
            valueX += landscapeValueShift;
          } else if (portraitShortName && positions.classSection.dynamicX) {
            valueX += portraitValueXShift;
          } else if (portraitLongName && positions.classSection.dynamicX) {
            valueX += portraitValueXShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG(student.className, {
              fontSize: portraitShortName ? Math.round(positions.classSection.fontSize * portraitScale) : positions.classSection.fontSize,
              color: '#000000',
              fontWeight: 'bold'
            }),
            top: positions.classSection.y + nameExtraHeight + belowNameExtraSpacing,
            left: valueX
          });
        }

        // Add "DOB:" label (adjust position if name is multi-line)
        if (positions.dobLabel) {
          let labelX = positions.dobLabel.x;
          if (landscapeShortName && positions.dobLabel.dynamicX) {
            labelX += landscapeLabelShift;
          } else if (portraitLongName) {
            labelX += portraitLabelLeftShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG('DOB:', {
              fontSize: portraitShortName ? Math.round(positions.dobLabel.fontSize * portraitScale) : positions.dobLabel.fontSize,
              color: '#000000',
              fontWeight: positions.dobLabel.fontWeight || 'bold'
            }),
            top: positions.dobLabel.y + nameExtraHeight + belowNameExtraSpacing,
            left: labelX
          });
        }

        // Add DOB value (adjust position if name is multi-line)
        if (positions.dob && student.dateOfBirth) {
          let valueX = positions.dob.x;
          if (landscapeShortName && positions.dob.dynamicX) {
            valueX += landscapeValueShift;
          } else if (portraitShortName && positions.dob.dynamicX) {
            valueX += portraitValueXShift;
          } else if (portraitLongName && positions.dob.dynamicX) {
            valueX += portraitValueXShift; // Shift left for long names
          }
          compositeImages.push({
            input: this.createTextSVG(student.dateOfBirth, {
              fontSize: portraitShortName ? Math.round(positions.dob.fontSize * portraitScale) : positions.dob.fontSize,
              color: '#000000',
              fontWeight: 'bold'
            }),
            top: positions.dob.y + nameExtraHeight + belowNameExtraSpacing,
            left: valueX
          });
        }

        // Add blood group inside the blood drop icon
        if (positions.bloodGroup && student.bloodGroup) {
          compositeImages.push({
            input: this.createTextSVG(student.bloodGroup, {
              fontSize: positions.bloodGroup.fontSize,
              color: positions.bloodGroup.color || '#000000',
              fontWeight: positions.bloodGroup.fontWeight || 'bold'
            }),
            top: positions.bloodGroup.y,
            left: positions.bloodGroup.x
          });
        }
      } else {
        // Back side fields (labels already on template)

        // Student Address value (starts from leftmost position, directly under the template label)
        if (positions.address && student.address) {
          let fontSize = positions.address.fontSize;
          let maxCharsPerLine = positions.address.maxCharsPerLine || 50;
          let yPosition = positions.address.y;
          let allowMultiLine = false;

          // Auto-size if enabled
          if (positions.address.autoSize) {
            // Step 1: Try to fit in 1 line first
            let optimal = this.calculateOptimalTextSize(student.address, {
              fontSize: positions.address.fontSize,
              maxWidth: positions.address.maxWidth,
              maxCharsPerLine: positions.address.maxCharsPerLine,
              minFontSize: positions.address.minFontSize || 14,
              maxLines: 1
            });

            // Check if text still doesn't fit in 1 line even after reduction
            const lines = this.wrapText(student.address, optimal.maxCharsPerLine);

            if (lines.length > 1) {
              // Step 2: Text needs multiple lines, recalculate with maxLines: 3 or 4
              const maxLinesAllowed = positions.address.maxLines || 3;
              optimal = this.calculateOptimalTextSize(student.address, {
                fontSize: optimal.fontSize, // Start from already reduced size
                maxWidth: positions.address.maxWidth,
                maxCharsPerLine: optimal.maxCharsPerLine,
                minFontSize: positions.address.minFontSize || 14,
                maxLines: maxLinesAllowed
              });

              allowMultiLine = true;
            }

            fontSize = optimal.fontSize;
            maxCharsPerLine = optimal.maxCharsPerLine;
          }

          // Always use multiLine for address fields
          const textMethod = positions.address.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';

          // Prepare options for address rendering
          const addressOptions = {
            fontSize: fontSize,
            color: '#000000',
            fontWeight: positions.address.fontWeight || 'normal',
            maxWidth: positions.address.maxWidth || 600,
            maxCharsPerLine: maxCharsPerLine,
            lineHeight: positions.address.lineHeight || 1.2,
            textAlign: positions.address.textAlign || 'left'
          };

          // For landscape back: first line after colon, subsequent lines from leftmost
          if (orientation === 'landscape' && side === 'back' && positions.address.firstLineX && positions.address.subsequentLinesX) {
            addressOptions.firstLineX = positions.address.firstLineX;
            addressOptions.subsequentLinesX = positions.address.subsequentLinesX;
            // ALWAYS use different char limits for first line vs subsequent lines
            addressOptions.subsequentMaxCharsPerLine = positions.address.subsequentMaxCharsPerLine || maxCharsPerLine;
          }

          const addressResult = this[textMethod](student.address, addressOptions);

          // Calculate address height for dynamic positioning
          const addressLines = this.wrapText(student.address, maxCharsPerLine);
          const addressHeight = addressLines.length * fontSize * (positions.address.lineHeight || 1.3);

          // Check if result is multi-position metadata (special case for landscape back)
          if (addressResult.isMultiPosition) {
            // Create separate composite entries for each line with different X positions
            addressResult.lines.forEach((line, index) => {
              const lineX = index === 0 ? addressResult.firstLineX : addressResult.subsequentLinesX;
              const lineY = yPosition + (index * addressResult.fontSize * addressResult.lineHeight);

              compositeImages.push({
                input: this.createTextSVG(line, {
                  fontSize: addressResult.fontSize,
                  fontFamily: addressResult.fontFamily,
                  color: addressResult.color,
                  fontWeight: addressResult.fontWeight,
                  maxWidth: addressResult.maxWidth
                }),
                top: Math.round(lineY),
                left: lineX
              });
            });
          } else {
            // Standard single buffer result
            compositeImages.push({
              input: addressResult,
              top: Math.round(yPosition),
              left: positions.address.x
            });
          }

          // Store height for dynamic positioning (portrait back side)
          if (orientation === 'portrait' && side === 'back') {
            fieldHeights['address'] = {
              y: yPosition,
              height: addressHeight,
              bottomY: yPosition + addressHeight
            };
          }
        }

        // Mobile label (already on template, just add value after colon)
        if (positions.mobile && (student.phone || student.contactNumber)) {
          // Calculate dynamic Y position if dependsOn is set
          let mobileY = positions.mobile.y;
          if (positions.mobile.dynamicY && positions.mobile.dependsOn && fieldHeights[positions.mobile.dependsOn]) {
            const dependentField = fieldHeights[positions.mobile.dependsOn];
            mobileY = dependentField.bottomY + 10; // 10px gap
          }

          compositeImages.push({
            input: this.createTextSVG(student.phone || student.contactNumber, {
              fontSize: positions.mobile.fontSize,
              color: '#000000',
              fontWeight: 'normal'
            }),
            top: Math.round(mobileY),
            left: positions.mobile.x
          });
        }

        // "If found return to" section - Add school name and address
        if (positions.returnSchoolName && schoolInfo.schoolName) {
          let fontSize = positions.returnSchoolName.fontSize;
          let maxCharsPerLine = positions.returnSchoolName.maxCharsPerLine || 40;

          // Auto-size if enabled
          if (positions.returnSchoolName.autoSize) {
            const optimal = this.calculateOptimalTextSize(schoolInfo.schoolName, {
              fontSize: positions.returnSchoolName.fontSize,
              maxWidth: positions.returnSchoolName.maxWidth,
              maxCharsPerLine: positions.returnSchoolName.maxCharsPerLine,
              minFontSize: positions.returnSchoolName.minFontSize || 14,
              maxLines: positions.returnSchoolName.maxLines || 2
            });
            fontSize = optimal.fontSize;
            maxCharsPerLine = optimal.maxCharsPerLine;
          }

          const textMethod = positions.returnSchoolName.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';

          // Calculate dynamic Y position if dependsOn is set
          let returnSchoolNameY = positions.returnSchoolName.y;
          if (positions.returnSchoolName.dynamicY && positions.returnSchoolName.baseY) {
            returnSchoolNameY = positions.returnSchoolName.baseY;
          }

          // Calculate height for tracking
          const returnSchoolNameLines = this.wrapText(schoolInfo.schoolName, maxCharsPerLine);
          const returnSchoolNameHeight = returnSchoolNameLines.length * fontSize * (positions.returnSchoolName.lineHeight || 1.15);

          compositeImages.push({
            input: this[textMethod](schoolInfo.schoolName, {
              fontSize: fontSize,
              color: '#000000',
              fontWeight: positions.returnSchoolName.fontWeight || 'bold',
              maxWidth: positions.returnSchoolName.maxWidth || 600,
              maxCharsPerLine: maxCharsPerLine,
              lineHeight: positions.returnSchoolName.lineHeight || 1.15,
              textAlign: positions.returnSchoolName.textAlign || 'left'
            }),
            top: Math.round(returnSchoolNameY),
            left: positions.returnSchoolName.x
          });

          // Store height for dynamic positioning
          if (orientation === 'portrait' && side === 'back') {
            fieldHeights['returnSchoolName'] = {
              y: returnSchoolNameY,
              height: returnSchoolNameHeight,
              bottomY: returnSchoolNameY + returnSchoolNameHeight
            };
          }
        }

        if (positions.returnAddress && schoolInfo.address) {
          let fontSize = positions.returnAddress.fontSize;
          let maxCharsPerLine = positions.returnAddress.maxCharsPerLine || 40;

          // Auto-size if enabled
          if (positions.returnAddress.autoSize) {
            const optimal = this.calculateOptimalTextSize(schoolInfo.address, {
              fontSize: positions.returnAddress.fontSize,
              maxWidth: positions.returnAddress.maxWidth,
              maxCharsPerLine: positions.returnAddress.maxCharsPerLine,
              minFontSize: positions.returnAddress.minFontSize || 14,
              maxLines: positions.returnAddress.maxLines || 2
            });
            fontSize = optimal.fontSize;
            maxCharsPerLine = optimal.maxCharsPerLine;
          }

          const textMethod = positions.returnAddress.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';

          // Calculate dynamic Y position if dependsOn is set
          let returnAddressY = positions.returnAddress.y;
          if (positions.returnAddress.dynamicY && positions.returnAddress.dependsOn && fieldHeights[positions.returnAddress.dependsOn]) {
            const dependentField = fieldHeights[positions.returnAddress.dependsOn];
            returnAddressY = dependentField.bottomY + 5; // 5px gap
          }

          // Calculate height for tracking
          const returnAddressLines = this.wrapText(schoolInfo.address, maxCharsPerLine);
          const returnAddressHeight = returnAddressLines.length * fontSize * (positions.returnAddress.lineHeight || 1.15);

          compositeImages.push({
            input: this[textMethod](schoolInfo.address, {
              fontSize: fontSize,
              color: '#000000',
              fontWeight: positions.returnAddress.fontWeight || 'normal',
              maxWidth: positions.returnAddress.maxWidth || 600,
              maxCharsPerLine: maxCharsPerLine,
              lineHeight: positions.returnAddress.lineHeight || 1.15,
              textAlign: positions.returnAddress.textAlign || 'left'
            }),
            top: Math.round(returnAddressY),
            left: positions.returnAddress.x
          });

          // Store height for dynamic positioning
          if (orientation === 'portrait' && side === 'back') {
            fieldHeights['returnAddress'] = {
              y: returnAddressY,
              height: returnAddressHeight,
              bottomY: returnAddressY + returnAddressHeight
            };
          }
        }

        // Add school phone (BACK SIDE ONLY)
        if (positions.schoolPhone && schoolInfo.phone) {
          // Calculate dynamic Y position if dependsOn is set
          let schoolPhoneY = positions.schoolPhone.y;
          if (positions.schoolPhone.dynamicY && positions.schoolPhone.dependsOn && fieldHeights[positions.schoolPhone.dependsOn]) {
            const dependentField = fieldHeights[positions.schoolPhone.dependsOn];
            schoolPhoneY = dependentField.bottomY + 5; // 5px gap
          }

          // Calculate height for tracking
          const phoneText = `Phone: ${schoolInfo.phone}`;
          const phoneLines = positions.schoolPhone.multiLine ? this.wrapText(phoneText, positions.schoolPhone.maxCharsPerLine || 35) : [phoneText];
          const phoneHeight = phoneLines.length * positions.schoolPhone.fontSize * (positions.schoolPhone.lineHeight || 1.15);

          const textMethod = positions.schoolPhone.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';
          compositeImages.push({
            input: this[textMethod](phoneText, {
              fontSize: positions.schoolPhone.fontSize,
              color: '#000000',
              fontWeight: positions.schoolPhone.fontWeight || 'normal',
              maxWidth: positions.schoolPhone.maxWidth || 600,
              maxCharsPerLine: positions.schoolPhone.maxCharsPerLine || 35,
              lineHeight: positions.schoolPhone.lineHeight || 1.15,
              textAlign: positions.schoolPhone.textAlign || 'left'
            }),
            top: Math.round(schoolPhoneY),
            left: positions.schoolPhone.x
          });

          // Store height for dynamic positioning
          if (orientation === 'portrait' && side === 'back') {
            fieldHeights['schoolPhone'] = {
              y: schoolPhoneY,
              height: phoneHeight,
              bottomY: schoolPhoneY + phoneHeight
            };
          }
        }

        // Add school email (BACK SIDE ONLY)
        if (positions.schoolEmail && schoolInfo.email) {
          // Calculate dynamic Y position if dependsOn is set
          let schoolEmailY = positions.schoolEmail.y;
          if (positions.schoolEmail.dynamicY && positions.schoolEmail.dependsOn && fieldHeights[positions.schoolEmail.dependsOn]) {
            const dependentField = fieldHeights[positions.schoolEmail.dependsOn];
            schoolEmailY = dependentField.bottomY + 5; // 5px gap
          }

          const emailText = `Email: ${schoolInfo.email}`;
          const textMethod = positions.schoolEmail.multiLine ? 'createMultiLineTextSVG' : 'createTextSVG';
          compositeImages.push({
            input: this[textMethod](emailText, {
              fontSize: positions.schoolEmail.fontSize,
              color: '#000000',
              fontWeight: positions.schoolEmail.fontWeight || 'normal',
              maxWidth: positions.schoolEmail.maxWidth || 600,
              maxCharsPerLine: positions.schoolEmail.maxCharsPerLine || 35,
              lineHeight: positions.schoolEmail.lineHeight || 1.15,
              textAlign: positions.schoolEmail.textAlign || 'left'
            }),
            top: Math.round(schoolEmailY),
            left: positions.schoolEmail.x
          });
        }
      }

      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      // Generate output filename using sequence ID
      const studentId = student.sequenceId || student.rollNumber || student._id;
      const outputFilename = `${studentId}_${side}.png`;
      const outputPath = path.join(this.outputDir, outputFilename);

      // Composite everything on template
      await sharp(templateBuffer)
        .composite(compositeImages)
        .png({ quality: 100 })
        .toFile(outputPath);

      console.log(`✅ ID card generated: ${outputFilename}`);

      return {
        success: true,
        outputPath,
        relativePath: `/uploads/generated-idcards/${outputFilename}`,
        message: 'ID card generated successfully'
      };
    } catch (error) {
      console.error(`❌ Error generating ID card for ${student.name}:`, error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        student: {
          name: student.name,
          id: student._id,
          className: student.className,
          section: student.section
        }
      });
      throw error;
    }
  }

  /**
   * Download image from URL or read from local path
   */
  async downloadImage(imagePath) {
    try {
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        // Fetch from URL (Cloudinary or external)
        const axios = require('axios');
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
      } else {
        // Handle relative paths (local files)
        if (imagePath.startsWith('/uploads')) {
          imagePath = path.join(__dirname, '..', imagePath);
        }
        // Check if file exists
        await fs.access(imagePath);
        return await fs.readFile(imagePath);
      }
    } catch (error) {
      console.warn(`⚠️ Could not load image from ${imagePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate ID card as buffer (in-memory) without saving to disk
   */
  async generateIDCardBuffer(student, orientation = 'landscape', side = 'front', schoolInfo = {}) {
    try {
      console.log(`🎨 Generating ID card buffer for ${student.name} (${orientation} ${side})`);

      // Get template path
      const templateFilename = `${orientation}-${side}.png`;
      const templatePath = path.join(this.templatesDir, templateFilename);

      // Check if template exists
      try {
        await fs.access(templatePath);
      } catch (err) {
        throw new Error(`Template not found: ${templatePath}`);
      }

      // Load template
      const templateBuffer = await fs.readFile(templatePath);

      // Get field positions for this orientation and side
      const positions = this.getFieldPositions(orientation, side);

      // Array to store all composite images
      const compositeImages = [];

      // Track field heights for dynamic positioning (portrait mode)
      const fieldHeights = {};

      // Use the same logic as the original generateIDCard method
      const result = await this.generateIDCard(student, orientation, side, schoolInfo);

      // Read the generated file and return as buffer
      const generatedBuffer = await fs.readFile(result.outputPath);

      // Clean up the temporary file
      await fs.unlink(result.outputPath);

      return generatedBuffer;

    } catch (error) {
      console.error(`❌ Error generating ID card buffer for ${student.name}:`, error);
      throw error;
    }
  }

  /**
   * Generate ID cards for multiple students
   */
  async generateBulkIDCards(students, orientation = 'landscape', includeBack = true, schoolInfo = {}) {
    console.log(`📦 Bulk generation started:`, {
      studentCount: students.length,
      orientation,
      includeBack,
      schoolInfo: {
        hasSchoolName: !!schoolInfo.schoolName,
        hasAddress: !!schoolInfo.address,
        hasLogo: !!schoolInfo.logoUrl
      }
    });

    const results = {
      success: [],
      failed: []
    };

    for (const student of students) {
      try {
        // Validate student has required data
        if (!student || !student.name) {
          console.warn(`⚠️ Skipping student with missing name:`, student);
          results.failed.push({
            studentId: student?._id || 'unknown',
            studentName: 'Unknown',
            error: 'Student name is missing'
          });
          continue;
        }

        console.log(`\n🔄 Processing student: ${student.name} with orientation: ${orientation}`);

        // Generate front
        const frontResult = await this.generateIDCard(student, orientation, 'front', schoolInfo);
        console.log(`✅ Front card generated: ${frontResult.relativePath}`);

        let backResult = null;
        if (includeBack) {
          // Generate back
          backResult = await this.generateIDCard(student, orientation, 'back', schoolInfo);
          console.log(`✅ Back card generated: ${backResult.relativePath}`);
        }

        results.success.push({
          studentId: student._id,
          sequenceId: student.sequenceId || student.rollNumber || student._id,
          studentName: student.name,
          frontCard: frontResult.relativePath,
          backCard: backResult ? backResult.relativePath : null
        });
      } catch (error) {
        console.error(`❌ Failed to generate ID card for ${student.name}:`, error);
        console.error('Error details:', error.stack);
        results.failed.push({
          studentId: student._id,
          studentName: student.name,
          error: error.message,
          errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
        // Continue processing other students
        continue;
      }
    }

    return results;
  }
}

module.exports = new SimpleIDCardGenerator();
