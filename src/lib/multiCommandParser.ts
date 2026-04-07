/**
 * Multi-command parser for Arabic accounting commands
 * Splits a single message containing multiple accounting operations
 * into individual commands for sequential processing.
 */

const COMMAND_STARTERS = [
  'بعت', 'بيعت', 'شريت', 'اشتريت',
  'صرفت', 'دفعت', 'اصرف', 'ادفع',
  'قبضت', 'حصلت', 'استلمت', 'اقبض',
  'حولت', 'حول', 'نقلت',
  'أودعت', 'ايداع', 'سحبت',
  'أعطيت', 'أخذت',
  'سجل', 'سجلي', 'أنشئ',
  'ضيف', 'أضف',
];

// These are inquiry/question starters — not transaction commands
const QUESTION_STARTERS = [
  'كم', 'شو', 'ما', 'هل', 'وين', 'أين', 'متى', 'ليش', 'كيف',
  'أعطيني', 'وريني', 'ابحث', 'اعرض',
];

function isCommandStarter(line: string): boolean {
  const trimmed = line.trim();
  // Remove leading "و" connector
  const withoutWaw = trimmed.startsWith('و') ? trimmed.slice(1).trim() : trimmed;
  
  return COMMAND_STARTERS.some(s => 
    trimmed.startsWith(s) || withoutWaw.startsWith(s)
  );
}

function isQuestionMessage(message: string): boolean {
  const trimmed = message.trim();
  return QUESTION_STARTERS.some(s => trimmed.startsWith(s));
}

export function splitMultipleCommands(message: string): string[] {
  const trimmed = message.trim();
  
  // If it's a question/inquiry, don't split
  if (isQuestionMessage(trimmed)) return [trimmed];
  
  // Split by newlines
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Single line — check if it contains multiple commands inline
  if (lines.length <= 1) {
    // Try to split by command starters within the line
    const commands: string[] = [];
    let remaining = trimmed;
    
    // Look for command starters after the first 10 chars
    for (const starter of COMMAND_STARTERS) {
      const regex = new RegExp(`\\s+(${starter})\\s`, 'g');
      let match: RegExpExecArray | null;
      const positions: number[] = [];
      
      while ((match = regex.exec(remaining)) !== null) {
        if (match.index > 8) { // Only split if starter is not at the beginning
          positions.push(match.index);
        }
      }
      
      if (positions.length > 0) {
        // Split at the first position found
        const pos = positions[0];
        commands.push(remaining.slice(0, pos).trim());
        remaining = remaining.slice(pos).trim();
      }
    }
    
    if (commands.length > 0) {
      commands.push(remaining.trim());
      return commands.filter(Boolean);
    }
    
    return [trimmed];
  }
  
  // Multiple lines — group by command starter
  const commands: string[] = [];
  let currentCommand = '';
  
  for (const line of lines) {
    if (isCommandStarter(line) && currentCommand) {
      commands.push(currentCommand.trim());
      currentCommand = line;
    } else {
      currentCommand += (currentCommand ? ' ' : '') + line;
    }
  }
  
  if (currentCommand) commands.push(currentCommand.trim());
  
  // If only 1 command found from grouping, return as-is
  return commands.length > 0 ? commands : [trimmed];
}

export type CommandType = 'sale' | 'purchase' | 'expense' | 'receipt' | 'transfer' | 'deposit' | 'withdrawal' | 'unknown';

export function classifyCommand(command: string): CommandType {
  const c = command.trim();
  
  if (/^(بعت|بيعت|مبيعات)/i.test(c)) return 'sale';
  if (/^(شريت|اشتريت|مشتريات)/i.test(c)) return 'purchase';
  if (/^(صرفت|دفعت|اصرف|ادفع)/i.test(c) && !/(لمورد|للمورد|فاتورة)/i.test(c)) return 'expense';
  if (/^(قبضت|حصلت|استلمت|اقبض)/i.test(c)) return 'receipt';
  if (/^(حولت|حول|نقلت)/i.test(c)) return 'transfer';
  if (/^(أودعت|ايداع)/i.test(c)) return 'deposit';
  if (/^(سحبت)/i.test(c)) return 'withdrawal';
  
  return 'unknown';
}

export function getCommandTypeLabel(type: CommandType): string {
  switch (type) {
    case 'sale': return 'فاتورة مبيعات';
    case 'purchase': return 'فاتورة مشتريات';
    case 'expense': return 'سند صرف';
    case 'receipt': return 'سند قبض';
    case 'transfer': return 'تحويل';
    case 'deposit': return 'إيداع';
    case 'withdrawal': return 'سحب';
    default: return 'عملية';
  }
}

export function getCommandTypeIcon(type: CommandType): string {
  switch (type) {
    case 'sale': return '🧾';
    case 'purchase': return '📦';
    case 'expense': return '💸';
    case 'receipt': return '💰';
    case 'transfer': return '🔄';
    case 'deposit': return '🏦';
    case 'withdrawal': return '🏧';
    default: return '📋';
  }
}
