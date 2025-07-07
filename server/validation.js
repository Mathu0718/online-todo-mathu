import { body } from 'express-validator';

export const taskValidationRules = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 2, max: 100 }).withMessage('Title must be 2-100 characters')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description too long')
    .escape(),
  body('priority')
    .isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority'),
  body('status')
    .isIn(['In Progress', 'Completed', 'Timed Out']).withMessage('Invalid status'),
  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid date'),
  body('collaborators')
    .optional()
    .isArray().withMessage('Collaborators must be an array'),
  body('collaborators.*.user')
    .optional()
    .isMongoId().withMessage('Collaborator user must be a valid user ID'),
  body('collaborators.*.canEdit')
    .optional()
    .isBoolean().withMessage('canEdit must be boolean'),
];
