/**
 * User.entity.ts
 *
 * TypeORM Entity for the User table.
 * This entity maps to the users table in the database.
 */
import { Entity, PrimaryColumn, Column, OneToMany, Relation, UpdateDateColumn } from 'typeorm';
import { Project } from './Project.entity.js';
import { Todo } from './Todo.entity.js';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'text' })
  username!: string;

  @UpdateDateColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: string;

  // Relationships
  @OneToMany(() => Project, (project) => project.user)
  projects!: Relation<Project[]>;

  @OneToMany(() => Todo, (todo) => todo.user)
  todos!: Relation<Todo[]>;
}
